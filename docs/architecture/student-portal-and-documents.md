# Student portal, profile changes and historic certificates — architecture (proposed)

Status: **design** — section 2 (student authentication: accounts, activation codes, sessions) is
**implemented in Phase 6**; the rest is planned. It extends,
and does not replace, the existing architecture: one NestJS API, one PostgreSQL database, Redis
sessions, BullMQ worker, private S3-compatible storage.

## 1. Principles

1. **One source of truth.** Students, registrations, results and certificates stay in their existing
   tables. The portal reads them; it never copies them.
2. **Two separate principals.** Staff (`users`) and students (`student_accounts`) authenticate through
   separate endpoints, cookies and guards. A student session can never satisfy a staff permission check,
   and a staff session is never treated as a student.
3. **Ownership is server-side.** Every student endpoint derives the student from the session and filters
   by it in the query (`WHERE student_id = :sessionStudentId`), never from a URL parameter alone.
4. **Pending ≠ authoritative.** Student submissions live in change requests until an authorised reviewer
   approves them; approval applies the change and writes the audit entry in one transaction.
5. **Evidence ≠ credential.** An uploaded historic certificate is a stored file plus metadata and a review
   status. Only Docversity-issued certificates (the existing `certificates` lifecycle) are digital
   credentials; nothing uploaded is ever presented as cryptographically verified.

## 2. Student authentication boundary

| Aspect                                                                        | Staff (existing)                         | Students (proposed)                                                                                                   |
| ----------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Identity table                                                                | `users`                                  | `student_accounts` (1 per `students` row)                                                                             |
| Login endpoint                                                                | `/api/v1/auth/login`                     | `/api/v1/student-auth/login`                                                                                          |
| Cookie                                                                        | `__Host-dv_session`                      | `__Host-dv_student` (distinct name, same flags: HttpOnly, Secure, SameSite=Lax)                                       |
| Redis session                                                                 | `dv:sess:*`                              | `dv:ssess:*`, records `principal: "student"`                                                                          |
| Guards                                                                        | AuthGuard → CsrfGuard → PermissionsGuard | `StudentAuthGuard` (+ the same CsrfGuard). Staff guards reject student sessions; student routes reject staff sessions |
| Permissions                                                                   | code-defined RBAC                        | none — a student can only reach `/api/v1/student/*`, scoped to self                                                   |
| Password hashing, rate limits, CSRF, session rotation, idle/absolute timeouts | Argon2id, Phase 3 limits                 | identical mechanisms, separate rate-limit keys                                                                        |

### Activation (proving ownership)

Registration number alone is never sufficient (it is printed on many documents). Initial method:

1. Staff issue a **single-use activation code** per registration (individually or in bulk after an
   import), delivered on paper or by the university's channel. Codes are ≥ 10 random characters from an
   unambiguous alphabet, stored only as an HMAC-SHA256 hash, expire (proposal: 30 days), and are revoked
   when re-issued.
2. The student enters **registration number + activation code**, chooses a password (Phase 3 policy) and
   optionally an email. Success creates/activates the `student_accounts` row linked to the registration's
   student, marks the code used, rotates the session, and is audited.
3. Failed attempts are rate-limited per registration number, per code and per IP; responses never reveal
   whether a registration number exists.
4. Later methods (verified email or phone OTP) plug in as additional `activation_method` values once the
   university confirms which contact data is reliable.

A student with several registrations has one account (it belongs to `students`, not to a registration).

## 3. Proposed database additions (new migrations only)

```text
student_accounts                 1 ── 1  students
  id, student_id UNIQUE, password_hash, status (PENDING|ACTIVE|LOCKED|DISABLED),
  email (nullable, lower-case), email_verified_at, activated_at, last_login_at, created_at, updated_at

student_activation_codes         * ── 1  student_registrations
  id, student_registration_id, code_hash (HMAC), method (ISSUED_CODE|EMAIL|PHONE),
  issued_by_user_id, issued_at, expires_at, used_at, revoked_at, failed_attempts
  partial UNIQUE (student_registration_id) WHERE used_at IS NULL AND revoked_at IS NULL

student_profile_change_requests  * ── 1  students
  id, student_id, submitted_by_account_id, type (DATE_OF_BIRTH|PHOTO|NAME_CORRECTION|PARENT_NAME_CORRECTION),
  proposed (jsonb), evidence_storage_key, status (PENDING|APPROVED|REJECTED|WITHDRAWN),
  reviewed_by_user_id, reviewed_at, review_note, applied_at, created_at
  CHECK: approved/rejected ⇒ reviewer + reviewed_at; one PENDING request per (student, type)

student_documents                * ── 1  student_registrations
  id, student_registration_id, kind (HISTORIC_CERTIFICATE|HISTORIC_MARKSHEET|OTHER),
  storage_key, content_type, size_bytes, sha256, original_filename (display only),
  document_number (legacy certificate number, nullable), issued_on,
  authenticity (UNREVIEWED|UNDER_REVIEW|ACCEPTED_AS_HISTORIC_RECORD|REJECTED|DISPUTED),
  certificate_id (nullable FK → certificates, when reconciled to a Docversity-issued certificate),
  visible_to_student (bool), uploaded_by_user_id, reviewed_by_user_id, reviewed_at, review_note,
  created_at, updated_at
  UNIQUE (sha256, student_registration_id); index (document_number)
  CHECK: visible_to_student ⇒ authenticity = 'ACCEPTED_AS_HISTORIC_RECORD'
```

Reused, **not** duplicated:

- `students` / `student_registrations` — the only student records; `photo_storage_key` and
  `date_of_birth` are written only by approving a change request (or by staff).
- `results` (PUBLISHED) — what the portal's results page shows; no copy.
- `certificates` — Docversity-issued credentials only. Historic uploads are **not** inserted here, so the
  certificate registry and public verification never treat them as issued credentials.
- `legacy_mappings` — old certificate numbers and QR references (`source_system = 'LEGACY_QR'`), pointing
  to a `student_document` (or a reconciled `certificate`) so printed legacy QR codes keep resolving to an
  honest status page ("historic record on file", not "verified").
- `import_jobs` / `import_rows` — a future `LEGACY_DOCUMENTS` import type for bulk uploads (a manifest
  workbook + files), using the same state machine, worker, storage and audit.
- `audit_logs` — new actions such as `STUDENT_ACCOUNT_ACTIVATED`, `ACTIVATION_CODE_ISSUED`,
  `PROFILE_CHANGE_SUBMITTED/APPROVED/REJECTED`, `STUDENT_DOCUMENT_UPLOADED/REVIEWED`,
  `STUDENT_DOCUMENT_DOWNLOADED`.

Not proposed: a `StudentDocumentAccess` table — access is derived from ownership + `visible_to_student`;
downloads are audited instead.

## 4. Historic certificate handling

Flow: upload (image/PDF) → validation (type sniffing, size, page/pixel limits, no active content) →
private storage (`documents/<registrationId>/<uuid>.<ext>`) → metadata capture (certificate number, issue
date, registration) → duplicate detection (same SHA-256; same document number on another registration)
→ **authorised review** (maker–checker: uploader ≠ reviewer) → authenticity status → optional legacy QR
mapping → visible in the student's document library (preview + download, ownership-checked, audited).
Bulk migration uses the import subsystem with a manifest. Public verification of a legacy QR shows the
review status in plain words and never a "cryptographically verified" badge.

## 5. Portal screens (planned)

| Route                        | Purpose                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `/student/register`          | Activate: registration number + activation code → set password                       |
| `/student/login`             | Student sign-in (separate from `/admin/login`)                                       |
| `/student`                   | Dashboard: registrations, latest published results, documents, pending requests      |
| `/student/profile`           | Read-only authoritative profile + "request a change" (DOB, photo, corrections)       |
| `/student/profile/requests`  | Own requests and their review status                                                 |
| `/student/results`           | Published results only                                                               |
| `/student/documents`         | Issued certificates and accepted historic records; preview/download                  |
| `/admin/student-accounts`    | Account status, issue/revoke activation codes (single + bulk/printable), lock/unlock |
| `/admin/profile-requests`    | Review queue with side-by-side current vs proposed, approve/reject with note         |
| `/admin/legacy-certificates` | Upload, match to registration, review authenticity, map legacy QR                    |

All built with the existing design system (AdminShell for staff; a lighter StudentShell for students),
the same data-table, form, state and stepper components, and the same accessibility/mobile standards.
