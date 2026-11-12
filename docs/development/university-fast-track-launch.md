# Fast-track first university launch packet

13 November 2026. Scope: mentor-approved homepage, fresh university environment, individually scoped
staff, approved 58-registration import, activation and DOB/photo review, with accepted security and
recovery. Live payments, QR integration and promotional frontend work are deferred. No live action
is authorized by this document. VPS access, accounts and real-data stages require explicit approval.

## Release record

Latest merged main checked: **`1b260b991faafdfc472ce9628382211ac5b52237`**, PR #33 simplified homepage.
[Main CI 43241331917](https://github.com/aryansharma1305/univarsity-doc/actions/runs/43241331917) passed.
Previously independently verified application image source:
**`2437d53a0a70e3e539c64d8f51f992b08dcad9f8`**, run `43237493661`, identical source tree to that merge.
It includes the simplified homepage; it does **not** include this branch's new edge/controller/staff
CLI changes. This branch needs review, CI, merge and a new complete immutable release before use.
Do not claim the new infrastructure release is approved or invent its future SHA.

Record final approved control/image-source SHA, successful exact-source run, full ZIP and payload
SHA-256 checks, four image identities and rehearsal/rollback/restore results together. Keep source,
archive and identities from one run; do not mix a new main tag with an older build's IDs. No deployed
SHA or new database migration result is available from this local task.

## Approved stage order

| Stage                       | Required evidence / authorization                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1. Review and release       | This branch's CI/runtime checks, approved immutable release and operator review                                                  |
| 2. Infrastructure           | Separate SSH approval; inventory, backup, resource acceptance, university hostname/TLS and bounded edge handoff approval         |
| 3. Empty database           | New project/volumes/keys, approved migrations/status, no students/registrations/programs/departments/sessions/users; no fixtures |
| 4. Staff                    | Approved mentor/Registrar/Exam Administrator identity and actual role grants; secure handover, recovery and MFA decision         |
| 5. Academic masters         | Exact session/code/dates, programs/departments, relationships, inactive status/access policy and person linkage                  |
| 6. Real preview             | Data-handling/source-digest approval, security/isolation and encrypted off-server restore accepted **before upload**             |
| 7. Import commit            | Explicit approval of exact preview job/digest/mappings and reconciliation; verified pre-import recovery point                    |
| 8. Pilot activation/profile | Authorized individual pilot identities, secure one-time-code distribution, login/isolation and staff-review acceptance           |
| 9. Cohort/handover          | Reconciled imported records, post-import encrypted backup, pilot success and mentor sign-off before wider codes/access           |

Infrastructure commands and limitations are in [shared-proxy coexistence](shared-proxy-coexistence.md).
Backup/restore commands and pending evidence are in [recovery](shared-proxy-recovery.md). Do not treat
stage order as blanket authorization to proceed through account creation or real import.

## Super Admin and individual staff

Use only the new university Compose project, initially as a single authorized operator. Run the
empty check before bootstrap, then exactly one initial Super Admin, then the after-bootstrap check
**before login or other actions create normal audit entries**. Passwords are entered twice at hidden
TTY prompts. Generate each independently in the approved password manager; never use argv, shared
ADMIN_PASSWORD environment variables, chat, screenshots, terminal recording, Git or CI logs.

```bash
u --profile operator run --rm --no-deps check-empty
u --profile operator run --rm --no-deps staff-bootstrap
u --profile operator run --rm --no-deps check-empty \
  node /operations/check-empty.mjs --after-bootstrap
# Only after each person's email/display name and role are separately approved:
u --profile operator run --rm --no-deps staff-bootstrap node dist/cli/create-staff.js --role REGISTRAR
u --profile operator run --rm --no-deps staff-bootstrap node dist/cli/create-staff.js --role EXAM_ADMIN
```

The distinct staff entry refuses Super Admin and makes old images fail closed (the file is absent),
rather than silently ignoring a new role flag. It reuses the existing hidden-input CLI. The optional
role flag preserves Super Admin bootstrap as the default on the original entry, rejects unknown/extra
arguments and assigns exactly one selected role with Argon2id and transactional ADMIN_CREATED audit.
No temporary Super Admin elevation or direct SQL demotion is used. REGISTRAR owns student import,
activation and profile review; EXAM_ADMIN has exam/result preparation permissions, not student import
or user management. Confirm the complete code-defined role grants with the institution.

The CLI can deliberately create additional Super Admins; it is not an atomic one-time bootstrap
lock. Use one operator and pre/post checks. No actual account/password was created here. The mentor
enters their own password where possible, or receives a restricted expiring handover and changes it
immediately. Verify each login/logout/rotation/session revocation, staff/student separation and
university credentials being rejected by staging, without recording plaintext credentials.

Email password-reset delivery is currently unconfigured and MFA is not implemented. Before staff
handover, implement/accept a tested identity-checked recovery procedure and require MFA or an explicit
university-owned temporary security exception with compensating access restrictions and deadline.
Do not advertise working email recovery or MFA from the existence of password-change/rate-limit code.

## Student Import Reconciliation Report — refreshed local file checks

Use only the existing protected identity-free copy, outside Git. Exact approved-copy candidate digest:
**`609d6b4f2a4367fda2c04ad092ea751cd3b953b6b2803675ec53ebf94f73699e`**.
Worksheet `Registration List`, prepared-copy data `A2:M59`. The original remains unchanged.

| Control                                                                                       | Revalidated local result                                   |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Source rows / unique normalized registration numbers                                          | 58 / 58                                                    |
| Duplicate registration groups / missing required name/registration/course/school/status cells | 0 / 0                                                      |
| Active / Inactive                                                                             | 55 / 3                                                     |
| Missing DOB / photograph                                                                      | 58 / 58                                                    |
| Recognized national-ID columns / original populated identity values detected in copy package  | 0 / 0                                                      |
| Non-ID data-cell mismatches against unchanged original                                        | 0                                                          |
| Fully authorized CREATE rows now                                                              | 0; target/mapping preview not run                          |
| Rows held for catalogue/session/data-handling decisions                                       | 58, including 3 requiring inactive status/access decisions |
| CREATE / UPDATE / SKIP / ERROR from application preview                                       | Not run                                                    |
| Actual imported / updated / skipped / failed                                                  | Not run; no commit authorized                              |

The copy passed ZIP integrity; no detected formula/error cells, comments, external-link/embedded/macro
parts or known source identity values remain. This is not a universal detector of unlabeled sensitive
data. An authorized reviewer must approve the exact copy. It still contains personal information;
do not attach it to GitHub, fixtures or staging. Unique registrations do not prove distinct people.

Mapping approvals are still required for both course labels (19 and 39 rows), both school labels
(56 and 2 rows), program/department relationships and registration/person identity linkage. Do not
assume a school/company label is a department. Session **2025** and Inactive → **SUSPENDED** remain
proposals. Active → ACTIVE is explicit. SUSPENDED does not itself block login in existing policy;
approve that separate access decision before issuing codes. Do not default unresolved rows to ACTIVE.

Map supported Name, Registration No., Admission Date, Course Name, School Name and Registration Status
fields, and the approved session. Keep DOB/photo blank. Registration Date, Nationality, Course Type
and Duration have no supported student-import target in the current contract; obtain decisions if
required and do not repurpose timestamps or invent program master values.

Registrar workflow: university `/admin/imports/new` → approved identity-free workbook/worksheet →
explicit mappings → worker validation → private review of every action/error → aggregate reconciliation.
Account for all 58 rows, normalized duplicates, date parsing, existing-target conflicts, person identity,
program/department relationships and any UPDATE. Preview uploads personal data, so backup/security
and data-handling authorization are prerequisites even before commit.

Record job ID, source digest, mapping version, approved master IDs/session/status policy, preview
counts and approval reference. After explicit reconciliation/commit approval, take a verified backup,
commit through the existing UI/API, monitor worker/retry history, and report final created registrations,
created students, updated/skipped/failed rows and full source accounting. Use durable retry/replay
controls, not truncation or blind re-upload. Capture a repeat preview/idempotency check and encrypted
off-server post-import backup. Leave actual result fields pending until an authorized run occurs.

## Pilot activation and DOB/photo completion

Authorized Registrar reviews `/admin/student-accounts` and issues individual expiring, single-use
codes to approved pilot students. Distribution requires identity verification and the university's
private channel. Default code TTL is 30 days; approve an appropriate value. Codes are hashed at rest,
shown only on issuance, throttled/revoked on repeated wrong attempts and audited. Registration alone
or a shared password must never activate an account.

Student: approved university hostname → `/student/register` → own registration + one-time code →
choose own strong password → `/student/login`. DOB is not required for initial activation. Verify
code expiry/reuse/reissue, inactive-access policy, successful pilot login and student A/B isolation
before wider distribution. Keep recipient/code sheets private; do not post a cohort export in chat.

Student: My Profile (`/student/profile`) → actual DOB + photo → review/submit → pending request.
Registrar: `/admin/profile-requests` → approve or reject with explanation. Official fields change only
after approval; requests and photos stay private and audited. Photo limits are still JPEG/PNG/WebP,
5 MiB, 200×200–8000×8000, decoded/re-encoded without metadata and stored at at most 1200 px longest
side. No invented DOB/photo and no extra permissions from profile completion.

## Final acceptance and remaining launch blockers

- New branch review, full CI, pinned Caddy parser/startup checks, immutable release packaging and
  synthetic two-site HTTPS/auth/load/backup/recovery rehearsal are pending. Local results are linked
  in [verification](shared-proxy-verification.md); they are not a deployed acceptance certificate.
- Explicit VPS access/resource-change/cutover authorization, host-key/console/operator validation,
  university hostname/DNS/TLS, memory/CPU/queue peaks and initial handoff/rollback window remain.
- Configure/test encrypted off-server DB/object backup, retention/key custody, an independent restore,
  queue/Redis recovery, monitored backup failures, alert delivery, SSH restrictions and OS reboot recovery.
- Mentor/staff identity approvals, secure credential handover, staff recovery/MFA requirements and
  actual role/login verification remain. Role-specific CLI engineering is included in this branch.
- University authority for actual records, exact source digest, academic/session/status/access mappings,
  catalogue relationships and person linkage remain. No real preview, commit or activation distribution
  may happen before their own approvals.
- Mentor accepts updated homepage, role functions, imported counts/statuses, pilot activation,
  private profile changes/review, staging isolation and recovery. All actual deployed/run/result fields
  are still pending. Preserve audit evidence without names/passwords/codes in the aggregate report.

Razorpay live collection, QR, official certificate signing/issuance, Rector actions and real public
academic verification remain restricted. Digital certificates remain free; no payment activation or
promotional frontend work is needed for this first records-portal launch. A working launch cannot be
claimed until the gated live stages and independent acceptance have actually occurred.
