# Student onboarding acceptance — 13 November 2026

Scope: student imports, staff bootstrap verification, activation and profile approval. Separate
worktree `docversity-student-onboarding-acceptance`, branch
`feature/student-onboarding-acceptance-20261113`, baseline `cadc644` (main already includes PR #34).
No deployment, Hostinger access, real accounts, real uploads or real database imports were performed.
No infrastructure or payment policy files were changed. Razorpay collection remains disabled.

Complete the separate [academic mapping and real-data authorization sheet](student-onboarding-academic-approvals-2026-11-13.md)
before any real upload. It records session, both programs, both school mappings, inactive access,
the exact-identifier approvals for worksheet rows 58–59, and separate preview/commit permissions.
All real-data approvals remain pending; only synthetic mentor testing is prepared by this change.

### Integration and tonight's mentor release

PR #34 is already merged into the current main baseline `cadc644`. The release workstream's
[follow-up PR #35](https://github.com/aryansharma1305/univarsity-doc/pull/35) changes infrastructure,
performance verification and release documentation; its current paths do not overlap this change's
seven files. Do not reuse an older application image archive for this navigation fix.

The next authorized release step is maintainer review of this onboarding PR alongside the release
workstream, followed by an explicitly approved integration and a fresh immutable image set built
from that final integration SHA with green checks. The release operator must complete its separate
capacity, security, recovery and deployment authorization gates. Mentor acceptance uses synthetic
records and the corrected role checklist below. No merge, image rollout or Hostinger access is
performed or authorized by this acceptance work. Academic/data approvals gate real processing
independently of a successful synthetic mentor rehearsal.

## Verified status and limitations

The existing implementation supports the required onboarding workflow. This branch fixes a list-search
navigation race and adds synthetic onboarding regressions. It changes no account, academic-status,
import or payment policies. Real onboarding is
**held for university decisions and authorization**. An import preview stores personal data, so preview
permission and commit permission are separate requirements.

The prepared identity-free workbook was read locally, in memory, through the current importer. It was
not copied into this worktree, uploaded to an application, GitHub or CI, or used by automated tests.
Only aggregate evidence and the academic labels below are reported. “Identity-free” means national-ID
columns were removed; names and registration numbers remain personal information.

| Private source control                                   | Verified result                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| SHA-256                                                  | `609d6b4f2a4367fda2c04ad092ea751cd3b953b6b2803675ec53ebf94f73699e` |
| File size / sheet / data range                           | 13,096 bytes / `Registration List` / `A2:M59`                      |
| Registration rows / unique normalized registrations      | 58 / 58                                                            |
| Duplicate registrations / missing required source fields | 0 / 0                                                              |
| Source statuses                                          | Active 55; Inactive 3                                              |
| DOB / photograph missing                                 | 58 / 58                                                            |
| Recognized identity headers / formula or error cells     | 0 / 0                                                              |
| Unsafe numeric registration values                       | 0                                                                  |
| Leading-zero warnings                                    | **2**, worksheet rows **58 and 59**                                |
| Actual university CREATE / UPDATE / SKIP / ERROR         | **Not run**                                                        |

The application flags the two shorter numeric registration numbers with
`REGISTRATION_NUMBER_MAY_HAVE_LOST_ZEROS`. This is a warning, not proof of corruption. Have the
university compare these identifiers privately against its authoritative register. Do not invent
padding or change the source. A corrected approved copy needs a new checksum and validation.

With hypothetical in-memory academic references and explicit Inactive → SUSPENDED translation, all
58 rows pass structural/row validation, with those two warnings. Without that status translation,
three rows return `INVALID_STATUS`. The hypothetical references were never persisted and are **not**
approved academic mappings or an actual target database preview. Distinct registrations do not prove
58 distinct people.

### Fixed onboarding defect

After typing in Search students, clicking Imports could leave the registrar on Students: the 300 ms
debounced search used `router.replace`, which started another route transition and cancelled the
pending Imports navigation. A minimized browser regression delays the Imports response by 800 ms;
it failed on the original code, remaining at `/admin/students?search=SYNTHETIC-PENDING-SEARCH`.

The shared `SearchInput` now cancels its pending debounce when the user follows a same-origin link
to another page. Cancellation survives outgoing-page rerenders and resets on fresh typing. Modified
clicks, new-tab links, downloads and same-page anchors retain the normal search behavior. Component
regressions cover normal search, cancellation before unmount, rerender/new typing, modified/new-tab
clicks, same-page anchors and unmount cleanup. The browser regression exercises actual delayed
navigation. The list URL hook and existing router contract remain unchanged. No UI redesign or new
workflow was added.

## Exact academic decisions needed

Active → `ACTIVE` is the existing confirmed mapping. Everything marked pending below needs a named
university approver, approval reference and date; do not substitute synthetic test masters.

| Decision                                     | Source / required approval                                                                                                                                                                                                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Academic session — pending                   | File has no session column. Confirm exact existing session UUID, code/name, starts-on/ends-on (or explicitly approved null dates), and non-archived status. `2025` is only a proposal; do not infer dates from the filename or admission dates.                                                        |
| Program A — pending                          | `Certificate in Ultrasound Technology`: **19** rows. Confirm exact active program UUID/code, official name, level, approved duration/unit and owning department.                                                                                                                                       |
| Program B — pending                          | `Certificate in diagnostic Ultrasonography`: **39** rows. Confirm exact active program UUID/code, official name, level, approved duration/unit and owning department. Confirm whether these are separate programs or approved aliases of one program.                                                  |
| School mapping A — pending                   | `Docversity India`: **56** rows. Decide whether this is an institution/campus label, an approved department alias, or should use the approved program's department. Do not create a department from the label automatically.                                                                           |
| School mapping B — pending                   | `Docversity School of Health Science`: **2** rows. Confirm department UUID/code and compatibility with Program A.                                                                                                                                                                                      |
| Inactive — pending                           | **3** rows: decide academic status; `SUSPENDED` is proposed, not approved. Decide portal access and code distribution separately.                                                                                                                                                                      |
| Identifier verification — pending            | Privately resolve the two leading-zero warnings at worksheet rows 58–59. Preserve exact authorized identifiers as text.                                                                                                                                                                                |
| Person linkage — pending                     | Confirm whether each registration belongs to a different new student. The importer creates a new Student for every new registration; it cannot link a new registration to an existing person by name. Resolve multi-registration people through authorized existing workflows before approving a plan. |
| Unmapped source fields — pending if required | Registration Date, Nationality, Course Type and Duration have no student-import target. Preserve offline; decide whether additional approved master-data entry is needed. Do not repurpose `createdAt`, program codes or admission dates.                                                              |

Course × school combinations that must be valid:

| Course                                    | Docversity India | Docversity School of Health Science | Total |
| ----------------------------------------- | ---------------: | ----------------------------------: | ----: |
| Certificate in Ultrasound Technology      |               17 |                                   2 |    19 |
| Certificate in diagnostic Ultrasonography |               39 |                                   0 |    39 |
| Total                                     |               56 |                                   2 |    58 |

If Program A has one department, both of its source school labels must resolve consistently with
that relationship. “No department” in the import map falls back to a program's department when one
exists; it does not erase that relationship. Resolve incompatible school/program meanings before
preview. Imports never create academic masters. A curriculum is not required for basic registration
import/activation; any course structure, subject catalogue or later curriculum assignment needs its
own approved academic data. Do not invent it to complete onboarding.

### Exact field map for the prepared copy

Removing original column H shifts later columns. Confirm headers, not the old column positions.

| Prepared column  | Source header                                                 | Import target / handling                                                                       |
| ---------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| B / 2            | Name                                                          | `fullName`                                                                                     |
| C / 3            | Admission Date                                                | `admissionDate`; actual Excel date cells parse without a text-date override                    |
| D / 4            | Registration No.                                              | `registrationNumber`; trimmed and uppercased for uniqueness; preserve approved identifier text |
| F / 6            | Date of Birth                                                 | `dateOfBirth`; all blank, leave blank                                                          |
| I / 9            | Course Name                                                   | `programCode`; explicit approved program UUID per source value                                 |
| K / 11           | School Name                                                   | `departmentCode`; explicit approved relationship mapping                                       |
| L / 12           | Registration Status                                           | `status`; Active → ACTIVE; Inactive only after approval                                        |
| No source column | Academic session                                              | `defaultAcademicSessionId`: approved UUID for every row                                        |
| M / 13           | Photo                                                         | No import target; student submission and staff review later                                    |
| A, E, G, H, J    | Serial, Registration Date, Nationality, Course Type, Duration | Unmapped                                                                                       |

Keep status mapped: omitting/clearing it defaults new registrations to ACTIVE. Do not use that default
to bypass the unresolved inactive decision. Do not fill missing DOB/photo with placeholders.

## Clean-university preview and reconciliation procedure

This is an operator procedure for a later explicitly authorized university run, not permission to
execute it. The release/infrastructure workstream owns environment readiness and recovery evidence.

1. Record the approved university instance and exact application SHA. Obtain its clean-database
   evidence: zero academic/student/account/import data before approved setup, exactly the authorized
   bootstrap staff afterwards, and no reviewer fixtures. Record later authorized master/staff changes
   as the pre-import baseline. Use no seed, reset or staging database. Require approved recovery
   evidence and the university's authorization to process this exact private file **before upload**.
2. Have the university approve the decisions above, source checksum, two identifier warnings, person
   linkage and a mapping version. Create only approved departments/programs/session through normal
   authorized UI/API. Confirm referenced programs/departments are active, the session is not archived,
   and every row's department/program relationship is legal.
3. REGISTRAR signs in at `/admin/imports/new`. Upload only the approved identity-free copy, type
   `STUDENTS`. Record the returned job UUID. Wait for `MAPPING`; select `Registration List`; compare
   all mapped headers against the table above. Reject a source carrying populated recognized identity
   columns. The privacy guard is header-based, so an authorized human must also inspect hidden data,
   comments and unintended personal columns; it is not a universal unlabeled-ID detector.
4. Set the field map, explicit value maps and approved default session. At the API, the equivalents
   are `POST /api/v1/imports/:id/mapping`, then `POST .../:id/validate` (staff session and staff CSRF).
   Value-map keys are trimmed, whitespace-collapsed uppercase labels; values are real approved UUIDs
   for programs/departments, and approved status enums. Retain the exact mapping and its approval
   privately. Wait for `VALIDATED` via `GET .../:id`.
5. Review **all** rows, including warnings/errors, via the UI or `GET .../:id/rows?filter=all` with
   pagination. Use `filter=errors`, `warnings`, `create`, `update`, `skip` and row detail as needed.
   Check dates, identifiers, unknown masters, relationship mismatch, normalized duplicates, status,
   target conflicts and person linkage privately. Store no row detail/error workbooks in Git or CI.
6. Reconcile the actual API counters below. Warning counts overlap actions. For a genuinely fresh
   target, all mappings approved and one new person per registration confirmed, the **conditional**
   expectation is 58 CREATE, 0 UPDATE, 0 SKIP, 0 ERROR; 55 ACTIVE and 3 approved inactive statuses.
   For the unchanged private file and otherwise valid mappings, expect 2 warning rows. Unexpected
   UPDATE/SKIP means investigate freshness/linkage; it is not automatic overwrite approval. Never
   present this conditional expectation as an actual preview result.
7. Stop on any unresolved mapping, identifier/person ambiguity, error, unreviewed warning, unexpected
   UPDATE/SKIP, or incomplete accounting. **The importer can commit valid rows while other rows have
   errors**; a visible Commit action does not mean the entire cohort is accepted. Do not partially
   commit the 55 active rows just to bypass three unresolved inactive rows.
8. Obtain separate written commit authorization naming the job UUID, source checksum, mapping version,
   reviewed counts/warnings and operator. Verify the recovery point. Commit through existing UI/API:
   `POST /api/v1/imports/:id/commit` with `{ "applyUpdates": false }` for this clean cohort.
   No bulk update approval is needed or appropriate for an all-new cohort.
9. Wait for terminal state and record durable job counters/audit. Reconcile every source row and
   compare pre/post totals. A 58-row all-new successful run should have `imported=created=58`,
   `updated=skipped=errors=0`; cohort academic statuses should total 55/3 under the approved mapping.
   Student DOB/photo and portal accounts should remain absent before separately authorized activation.
   Confirm student totals separately from registrations and explain any approved person linkage.
10. If interrupted, inspect persisted job/rows, failure stage, `failure.retryable` and `actions.retry`.
    Use only the existing `POST .../:id/retry` after resolving the cause. Batches are transactional
    and completed batches are replay-protected; a whole file is not one transaction. Preserve partial
    counts and audit. Never truncate tables, delete audit history, or blindly upload again.
11. A later authorized repeat preview of the same source/mapping should show 0 CREATE/UPDATE/ERROR and
    58 SKIP (`counts.unchanged=58`) if official data is unchanged. It creates another private source
    object/staged job, so include it in data-processing authorization. Leave it uncommitted or cancel
    through the normal workflow. Once profile data changes, blank DOB cells must not clear official
    values. Investigate all unexpected differences.
12. Only after reconciliation and separate distribution approval, select approved registration IDs in
    `/admin/student-accounts`. Bulk issuance by import UUID skips SUSPENDED and REVOKED registrations and disabled accounts.
    Withhold codes for the three inactive rows; any exception requires a separately approved workflow.
    Revoke any mistakenly issued codes. Distribute each code privately after
    identity checks. Never export/distribute the full cohort code sheet as a group.

### Counter accounting

`GET /api/v1/imports/:id` returns:

```text
total, valid, warnings, errors, create, update, unchanged,
imported, skipped, created, updated
```

Before commit: `valid + warnings + errors = total = 58` and
`create + update + unchanged + errors = 58`. `unchanged` is the count of preview SKIP actions;
`skipped` is the count actually skipped during processing. For the unchanged private copy and all
other prerequisites satisfied, the conditional preview is `valid=56, warnings=2, errors=0,
create=58, update=unchanged=0`. Acknowledged warnings are still CREATE actions.

After a successful complete run: `imported + skipped + errors = 58` and
`created + updated = imported`. If the job is still processing or failed retryably, those equations
can leave pending rows: report `58 - imported - skipped - errors` as not yet accounted for by terminal
row outcomes. Do not confuse warnings with failed rows. Inspect persisted per-row status when there
is a partial failure; never double-count retry attempts.

For a later authorized database-side reconciliation, these aggregate-only, read-only queries use
the reviewed import UUID. Run only against the explicitly selected university database. Set psql
variable `import_job_id` privately to that UUID; do not put connection passwords in commands/logs.

```sql
BEGIN TRANSACTION READ ONLY;

SELECT status, action, count(*) AS rows
FROM import_rows
WHERE import_job_id = :'import_job_id'::uuid
GROUP BY status, action ORDER BY status, action;

WITH cohort AS (
  SELECT DISTINCT registration_id FROM import_rows
  WHERE import_job_id = :'import_job_id'::uuid
    AND status = 'IMPORTED' AND registration_id IS NOT NULL
)
SELECT r.status, count(*) AS registrations,
       count(DISTINCT r.student_id) AS students
FROM cohort c JOIN student_registrations r ON r.id = c.registration_id
GROUP BY r.status ORDER BY r.status;

WITH cohort AS (
  SELECT DISTINCT r.student_id
  FROM import_rows i JOIN student_registrations r ON r.id = i.registration_id
  WHERE i.import_job_id = :'import_job_id'::uuid AND i.status = 'IMPORTED'
)
SELECT count(*) AS distinct_students,
       count(*) FILTER (WHERE s.date_of_birth IS NULL) AS missing_dob,
       count(*) FILTER (WHERE s.photo_storage_key IS NULL) AS missing_photo,
       count(a.id) AS portal_accounts
FROM cohort c JOIN students s ON s.id = c.student_id
LEFT JOIN student_accounts a ON a.student_id = s.id;

COMMIT;
```

Keep the private reconciliation record: instance/application SHA, operator, approved checksum,
mapping version, approvals, baseline counts, job UUID, source/action/status totals, warnings accepted,
commit and retry results, distinct students, DOB/photo/account counts and reviewer sign-off. Do not
copy names, registration values, photos, credentials or codes into the public handover.

## Staff, activation and profile verification

- Existing `create-admin` creates SUPER_ADMIN by default. Existing `create-staff --role REGISTRAR`
  and `--role EXAM_ADMIN` require an explicit permitted role; the staff entry refuses missing roles
  and SUPER_ADMIN. Use the reviewed built CLI, hidden password prompts and independent strong
  passwords after authorization. Invalid/duplicate emails and weak passwords are refused; passwords
  are Argon2id hashes; user/role and ADMIN_CREATED audit are transactional. No real account was made.
- The CLI is an operator tool with database authority, not a public signup endpoint. Authorization
  to run it must come from the university; do not infer that from possession of a checkout.
- Student activation needs registration + one-time code + student-selected strong password; DOB is
  unnecessary. Codes are hashed, expire, are consumed once, and can be revoked/reissued. Reissue for
  an existing account is **password recovery** and invalidates its old sessions. Issue only deliberately.
- Code issuance/activation refuse SUSPENDED or REVOKED registrations and DISABLED accounts.
  A code issued before suspension cannot activate or recover an account, including a status change
  during password hashing. Refused transaction-time attempts are audited with keyed identifiers.
  Existing login is still gated by the student's account status,
  not academic registration status; do not promise that changing academic status revokes a login.
  LOCKED/DISABLED account controls terminate sessions; account policy and academic status are separate.
- Staff/student sessions and CSRF are separate. Students cannot reach staff APIs or another student's
  private data. EXAM_ADMIN cannot import students, manage activation codes or review profile requests.
- Students submit DOB/photo requests at My Profile. Official values stay unchanged while pending or
  rejected. JPEG/PNG/WebP bytes are decoded, bounded and re-encoded to private JPEG without metadata;
  extension/MIME claims alone do not establish safety. REGISTRAR/SUPER_ADMIN review changes through
  `/admin/profile-requests`; approval is atomic and audited. Rejection requires a reason; ownership,
  one-pending-request, stale-record and concurrent-decision protections remain in place.
- Missing DOB/photo does not block unrelated portal use. Registration number alone is never an
  activation credential. Password reset delivery still requires a configured notifier; no real mail
  delivery or identity-check/distribution channel was verified here.

## Mentor acceptance checklist (synthetic records only)

Use an isolated approved local/reviewer instance with synthetic accounts; never the university
workbook for a rehearsal. Record role, case, expected/actual result, pass/fail and a redacted evidence
reference. Do not capture passwords, codes or session cookies in screenshots/traces.

- [ ] **SUPER_ADMIN:** approved bootstrap path, correct role only, independent strong password,
      login/logout/session expiry and CSRF; inspect staff-create audit with no password. Confirm student
      and staff sessions are separate. Keep Razorpay collection disabled.
- [ ] **REGISTRAR:** create/select synthetic approved masters; upload identity-free synthetic XLSX;
      verify a populated identity-column upload is rejected before storage. Confirm shifted field map,
      duplicate detection and unresolved Inactive errors; then explicit synthetic status mapping. Check
      58 CREATE / 55 ACTIVE / 3 SUSPENDED, blank DOB/photo, and repeat preview 58 SKIP.
- [ ] **REGISTRAR navigation:** type in Search students and immediately follow Imports, including on
      a slow connection. Imports must open; a delayed search must not return the user to Students.
      Confirm ordinary search still works, and a new-tab link does not cancel the current search.
- [ ] **REGISTRAR:** issue/revoke/reissue one student's code, verify single-use and expiry; explain
      that recovery replaces the password. Review one DOB/photo request; approve and verify official
      changes/audit; reject another with a reason and confirm official values stay unchanged.
- [ ] **EXAM_ADMIN:** login and authorized academic/exam reads work; student-import upload, account/code
      management, profile queue/details/photos/approval fail with authorization errors. Confirm no role
      escalation and no student principal from a staff cookie.
- [ ] **Student:** registration alone/wrong/expired/reused code fails; valid code with chosen strong
      password activates without DOB/photo. Login/logout works. Only own registrations/profile/photos
      are visible. Submit synthetic DOB/photo; pending data is not official; see approval/rejection result.
      Staff URLs and another student's request/photo must be denied.
- [ ] **Inactive/access decision:** verify SUSPENDED registrations receive no code and cannot redeem
      an earlier code. Approve distribution and existing-account access policy separately. Check lock/disable ends
      existing student sessions. Verify the two private identifier warnings outside screenshots/logs.
- [ ] **Handover:** sign mapping, checksum, preview and commit approvals separately. Record outstanding
      findings, reviewer and date; no real-data acceptance is implied by a synthetic test pass.

## Local validation evidence

Tests use newly created, uniquely named local PostgreSQL 17, Redis and MinIO services, loopback-only
ports and synthetic-only private buckets. No existing workstream database/bucket was reused. Tests
are run with Node 22.23.2 and pnpm 12.10.1. The private workbook is absent from all fixtures and test
inputs.

| Check                                                                                       | Final result                                                                                                                                         |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full workspace unit/integration suites (`turbo run test --concurrency=2 -- --maxWorkers=2`) | **1,121 passed in 137 files**                                                                                                                        |
| API suite, including strengthened original TTL test and synthetic 58-registration flow      | **511 passed**                                                                                                                                       |
| Full web suite, including search/navigation component regressions                           | **148 passed**                                                                                                                                       |
| Import engine                                                                               | **115 passed**                                                                                                                                       |
| Other workspace suites                                                                      | Database 109; validation 101; documents 68; payments 30; types 21; storage 4; worker 14: all passed                                                  |
| Build, lint and typecheck                                                                   | Passed; one existing React Compiler/TanStack warning in `data-table.tsx`                                                                             |
| Repository formatting and `git diff --check`                                                | Passed                                                                                                                                               |
| Migration/schema drift against isolated migrated test DB                                    | `No difference detected.`                                                                                                                            |
| Read-only reconciliation SQL                                                                | Executed successfully against synthetic test DB with an empty cohort UUID                                                                            |
| Minimized slow-navigation browser regression                                                | Original code failed; final fix passed                                                                                                               |
| Private-data review                                                                         | 116 source name/registration values checked locally against the seven candidate files; zero matches; workbook digest and modification time unchanged |

Counts for individual suites are included in the full workspace total and must not be added again.
The final **full browser suite passed 81/81 cases** (Chromium, desktop/mobile), including staff login,
student import, the slow-navigation regression, activation, ownership and profile approval/rejection.
The prior focused onboarding run passed 13/13. Exact pushed-head CI is verified separately in the PR.
Builds finish before browser testing starts.
No assertions or test timeouts were relaxed to obtain these results.

### Results-preview TTL diagnosis

Earlier host-side API runs observed relative Redis TTLs of 7,200,055 and 7,222,286 ms against the
unchanged ≤ 7,200,000 ms assertion. The preview store sets an **absolute** application-clock deadline
using Redis PXAT; relative PTTL is measured using Redis's clock. If the application clock is ahead,
PTTL can exceed two hours even though the exact requested deadline is correctly stored. This was
reproduced against the actual `ResultPreviewStore` with disposable synthetic keys: a simulated
application-clock offset of +60,000 ms produced PTTL 7,260,002 ms, while the stored absolute deadline
equaled the requested deadline exactly, both before and after validation. With no simulated offset,
PTTL was 7,199,990 ms and the deadline again matched exactly. Discard removed the diagnostic keys.

The original expiry API test passed against fresh local services. **Its positive-TTL and two-hour
upper-bound assertions remain unchanged.** An additional `PEXPIRETIME` assertion now verifies the
exact advertised deadline for each stored key, strengthening the lifecycle check. No production
result-preview code, TTL, retention policy or CI timeout was changed. This diagnoses a cross-clock
test-environment failure; it is not permission to ignore future deadline mismatches or clock drift.
Application and Redis clocks must be synchronized for the existing relative-TTL bound to hold.

The final full-suite results and exact pushed-head CI are release evidence; an earlier partial run
is not a substitute. Neither real-data acceptance nor VPS readiness is established by automated
tests. No merge or deployment is authorized by this packet. Temporary synthetic services and secrets
are local only; private diagnostics and aggregate evidence stay in ignored `.local/onboarding-acceptance/`.

Remaining blockers: approved academic catalogue/session and relationships, inactive academic/access
policy, two identifier warnings, person linkage, source-processing and commit authorization, approved
staff identities and activation distribution channel, and environment/recovery acceptance owned by
the release workstream. Live accounts, mail delivery, deployment and real-data import are unverified.
