# Clean university environment and student onboarding

Development branch: `feature/clean-university-onboarding`, based on green main
`e1ad1c30c84cc1941602bb013e49f61869aa7eb4`. No SSH, DNS, public deployment, real migration,
real import, actual account creation or payment activation has been performed.

The existing `docversity14h` protected synthetic reviewer environment at the owner-supplied Hostinger
address is **not** a university database. Preserve its volumes, secrets, backup and restore volumes.
The existing [Hostinger runbook](hostinger-operator-runbook.md) remains authoritative for that instance;
this document and `deploy/university/` prepare a **different** environment for separate review.

## Existing functionality reused

- `apps/api/src/cli/create-admin.ts` / `create-admin-core.ts`: explicit CLI, hidden password prompt,
  strong password validation, Argon2 hashing, duplicate refusal, SUPER_ADMIN role and audit event.
  No public bootstrap endpoint or default account is added.
- `apps/api/src/imports/`, `packages/imports/`: bounded XLSX input, course/school mapping, explicit
  default academic session, CREATE/UPDATE/SKIP/ERROR preview, approved updates only, transactional
  batches, retries, durable replay protection and protected registration fields.
- `apps/api/src/student-accounts/` and `student-auth/`: expiring single-use activation codes, stored
  hashes, registration + code + student-selected strong password, throttling and separate sessions.
  DOB is not part of initial activation. No password is derived from registration number or shared.
- `apps/api/src/student-profile/`: student-owned correction requests, private decoded/re-encoded
  photo storage, metadata removal, pending status, staff approval/rejection and transactional audit.
  Official records change only on approval; stale/concurrent corrections are already protected.
- Existing UI-03 My Profile shows missing DOB/photo without preventing other student functions.
  No student/admin UI redesign, authentication rewrite, schema migration or policy change is needed.

### Confirmed correction: source workbook privacy

Previously the import engine excluded identity-number fields from mapping and staged rows, but the
API stored the **original uploaded XLSX** in private MinIO before worker parsing. Thus populated ID
columns could still remain in the source object. `rejectPopulatedIdentityColumns` now runs bounded
container verification and inspects all sheets, including hidden columns/sheets, **before any object,
job, queue or audit write**. Populated known national-ID/passport/etc. columns (including formulas,
zero/false values and attached comments) are rejected without echoing values.

An empty identity column may remain as a non-mappable header. Upload an identity-free copy; retain
and secure the original source offline. No source bytes are silently rewritten. This is a deliberate
compatibility change: previously accepted files containing ID values now receive HTTP 400. The
existing synthetic Registration 2025 API/browser tests now prove refusal followed by a safe copy's
successful preview/import. This detects recognized identity headers, not arbitrary unlabeled IDs;
operator review of the upload copy is still required.

## Source inventory and unresolved mappings

Read-only assessment of the supplied Registration 2025 `(1)` workbook, 10 November 2026:

| Finding                                                    | Evidence                                                                     |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Original source SHA-256                                    | `5cc8eed92b30029ceb559420bae94da8060cc99ce27d1409a4adaa9b71efe7fe`           |
| Source size / worksheet                                    | 15,796 bytes / Registration List                                             |
| Populated registration rows                                | 58                                                                           |
| Unique normalized registration numbers / duplicate groups  | 58 / 0                                                                       |
| Missing name, registration, course, school or status cells | 0                                                                            |
| DOB / photograph missing                                   | 58 / 58                                                                      |
| Course / school labels                                     | 2 / 2                                                                        |
| Active / Inactive                                          | 55 / 3                                                                       |
| Populated national-ID cells                                | 56; values are not copied into reports, fixtures or logs                     |
| Distinct people                                            | **Unconfirmed**; unique names and registrations do not prove person identity |

The original workbook remains unchanged in Downloads and is not committed or uploaded. Aggregate
assessment is not a database import preview. Actual CREATE/UPDATE/SKIP/ERROR counts remain pending
an approved clean target, master data, mappings and explicit preview; do not label all 58 rows CREATE.

Owner decisions:

- Active → ACTIVE: confirmed.
- Academic session 2025: proposed, **pending university confirmation** (including exact dates/code).
- Inactive → SUSPENDED: proposed, **pending university approval**. Do not delete these students,
  silently change their status or use an unapproved default.
- Course labels → approved existing programs; school labels → approved departments: pending approved
  catalogue and relationship review. Fresh migrations contain no academic master data.
- Confirm identity linkage where one person may have multiple registrations. The current importer
  creates a Student for a new registration; registration uniqueness alone is not cross-registration
  identity proof. Resolve ambiguity before commit; never merge people by name alone.

## Clean environment setup (future authorized operator only)

`deploy/university/clean.py` is an **offline configuration generator**. It never invokes SSH, Docker
startup, migration, seeding, account creation, imports or DNS. It creates a random
`docversity-university-<nonce>` project, private directory, fresh independent PostgreSQL bootstrap,
owner and app credentials, Redis ACL/password, session secret and MinIO owner/app keys. It refuses
existing directories and credentials inside the checkout. No reviewer credentials, test bucket,
fixture service or default administrator is generated.

The production-mode topology reuses the existing Dockerfile and infrastructure pins, PostgreSQL
least-privilege init, MinIO private-bucket init and secret launcher. Each new service/network/volume is
separate; no external or existing volume is mounted. Only Caddy publishes a loopback HTTPS port
(default 3553). PostgreSQL, Redis, MinIO, API and web have no host ports. The backend network is
internal; secure cookies, same-origin CSRF/CORS, trust-proxy boundaries and RBAC remain active.
Initial API browser origin is `https://localhost:3553`, not the eventual public domain.

**Do not use the preserved old image set to activate these corrections.** This branch must be
reviewed, committed, CI-verified, merged and rebuilt as one complete immutable API/worker/web/tools
release. The old release archive remains a separate recovery resource. The generator accepts only
complete linux/amd64 manifests with immutable image IDs; `validate-release` refuses a dirty checkout
or mismatched image-source SHA. Configuration-only validation using an older manifest is not startup
or proof of the new application's behavior.

On the future approved VPS, in a separate clean checkout at the new image-source commit:

```bash
umask 077
export UNIVERSITY_DIR=/srv/docversity-university-private
export RELEASE_DIR=/srv/releases/APPROVED_ONBOARDING_SHA
# Load only the complete verified archive and compare every loaded ID with images.json first.
cd "$RELEASE_DIR"
sha256sum --check SHA256SUMS
docker load --input images.tar.gz
# Return to the clean reviewed source checkout; do not copy .env/.local from another deployment.
cd /srv/docversity-university-source
python3 deploy/university/clean.py prepare \
  --directory "$UNIVERSITY_DIR" --origin https://verify.thedocversity.com \
  --images "$RELEASE_DIR/images.json" --https-port 3553
python3 deploy/university/clean.py validate-release \
  --directory "$UNIVERSITY_DIR" --approved-sha APPROVED_ONBOARDING_SHA
python3 deploy/university/clean.py plan --directory "$UNIVERSITY_DIR"
```

`APPROVED_ONBOARDING_SHA` is deliberately unresolved until review/CI; it is not an executable default.
The plan prints exact, private-instance commands for manual review. It does not run them.
Before executing, verify local Unix-socket Docker context, adequate host capacity, free 3553, no
project/volume collision and immutable image identities. Never use a remote Docker context or set
`COMPOSE_PROJECT_NAME=docversity14h`. Do not run another project's staging launcher here.

The plan's sequence is: render Compose → start only fresh infrastructure → migrate the empty new DB
→ aggregate-only `check-empty` → interactive create-admin → `check-empty --after-bootstrap` → start
API/worker/web/private Caddy. It contains no `seed`, fixture, import, prune, down-volume or production
cutover command. Check all exit codes and health before continuing. Freshness validation refuses
any academic/application records and unexpected accounts; a bootstrap-only DB has exactly one active
Super Admin, role metadata and ADMIN_CREATED audit history. No actual such instance is created here.

## First administrator

Use only the plan's interactive existing CLI, after empty-DB validation:

```bash
# Substitute PROJECT from instance.json; never a staging/reviewer project.
docker compose --project-name PROJECT -f "$UNIVERSITY_DIR/compose.json" \
  run --rm --no-deps api node dist/cli/create-admin.js
```

The private runtime launcher injects this instance's app credentials. Enter the university-approved
administrator email/display name and an independently generated strong password at the hidden TTY
prompt. Never pass the password in argv, a shared default, command history, screenshots, Git or chat.
Store it in the designated password manager; assign additional least-privilege staff only after
separate authorization. Run the printed after-bootstrap check. A failure blocks access and import;
never delete audit/history to force it to pass. Review existing session credential-binding deployment
notes; no old reviewer/student sessions should be copied into the new Redis instance.

## Registration 2025 import checklist

1. University confirms source ownership, session, program/department catalogue, inactive mapping,
   person/registration linkage, privacy handling, importing operator and backup ownership.
2. Preserve the original workbook and checksum offline. In Excel save a **separate copy**, remove
   national-ID values/columns and sensitive comments/hidden sheets, and inspect all other columns for
   unintended identity values. Keep all names, registration numbers and legitimate student details.
   Do not fill missing DOB/photo. Do not upload the original ID-bearing workbook.
3. Create only the university-approved departments, programs and session through normal staff APIs/UI.
   Confirm program/department relationships; never invent durations or let import create masters.
4. REGISTRAR/import-authorized staff use `/admin/imports/new`, upload the identity-free copy and choose
   Registration List. Map Name, Registration No., Course Name, School Name and Registration Status.
   Map the verified Admission Date to `admissionDate`, and select the confirmed session for every row.
   Keep DOB/photo blank. Registration Date, Nationality, Course Type and Duration have no supported
   student-import target in the current contract; preserve them in the original offline source and
   obtain an explicit mapping decision if the institution requires those fields in Docversity. Do not
   repurpose creation timestamps or create course master values from them.
5. Confirm Active → ACTIVE. Do **not** set Inactive → SUSPENDED until written approval. Keep unresolved
   rows/errors visible; do not silently skip/drop inactive students.
6. Validate and review CREATE/UPDATE/SKIP/ERROR counts, duplicate/name ambiguity, missing/unsafe values,
   program/school conflicts and per-row details. Compare 58 source rows to preview/reconciliation;
   distinguish registration and person counts. Approve updates explicitly, never blanket overwrite.
7. Capture the private preview, source-copy digest, job ID, mapping decisions and approval record.
   Stop on errors or unexpected updates. Take a verified backup before authorized commit.
8. Commit only after university approval. Monitor worker/retry history; use existing retry/replay
   controls for failed batches. Never truncate tables or re-upload blindly to repair partial work.
9. Reconcile created/updated/skipped registrations and preserved inactive rows. A repeat validation
   must show existing/skip or deliberate updates; it must not create duplicate registrations.

This phase does **not** run these steps on real records or produce an actual import-job preview.
Synthetic tests exercise the same paths, including idempotency and failure recovery.

## Activation procedure

After approved successful import, staff open the imported cohort in `/admin/student-accounts`, review
registration/account status and issue one-time codes using existing permissions. Codes expire under
the configured TTL (default 30 days), can be revoked/reissued and appear in plaintext only on issuance.
Distribute each through a university-approved, identity-checked private channel to its actual student.
Never share the entire cohort sheet, post codes publicly or enable registration-only activation.
Students use `/student/register` with their registration, code and chosen strong password, then use
the existing `/student/login` flow. No DOB is required to activate. Existing policy refuses REVOKED
registrations and disabled accounts; do not reinterpret SUSPENDED as an automatic account decision.
University must approve the intended handling of inactive students; preserve the implemented gates.

## DOB/photo completion and approval

Students log in → My Profile → submit missing DOB/photo or correction → view My update requests.
Uploads remain student-owned/private; declared MIME and extension alone are insufficient. Existing
validation decodes a still JPEG/PNG/WebP, checks byte/pixel/dimension limits and re-encodes clean JPEG
without embedded EXIF/GPS. Only authorized staff can review; student views cannot access another
student's original/pending photo or staff-only notes. Approve/reject with an explanation through the
existing review UI. Pending/rejected requests do not silently alter the official student record.
Missing values remain explicitly missing and do not block unrelated functions. Audit and race tests
remain required; do not directly update DOB/photo in SQL to bypass review.

## Cutover and reversible rollback (not executed)

No real cutover is authorized. After new release CI/images, operator access, domain/TLS authorization,
private secrets, encrypted off-host backup and recovery ownership are confirmed:

```bash
python3 deploy/university/clean.py prepare-public-candidate \
  --directory "$UNIVERSITY_DIR" --acme-email APPROVED_ACME_CONTACT
# Read and validate the candidate; this command alone makes no certificate/DNS request.
docker compose -f "$UNIVERSITY_DIR/public-candidate/compose.json" config --quiet
```

Review exact project/volumes/image IDs and public candidate secret origin. Only Caddy publishes 80/443;
source runtime files and private configuration remain intact. TLS certificates will be requested only
if an authorized operator later starts the candidate. Do not run it while `docversity14h` owns 80/443.

In an approved maintenance window, take/verify the reviewer backup using its existing runbook, record
all original container/volume/image IDs, then stop the reviewer stack with **its own** `staging.py stop`
from its original checkout (never `down -v`). Start the new public candidate with its unique project
and complete immutable images; validate strict HTTPS (no `-k` for acceptance), admin/student login,
logout, secure cookies, authorization, health, uploads, worker, private storage and disabled policy
operations before approving imports/access. No DNS change is implied if the hostname remains on the
same approved VPS; any actual change needs separate authorization.

After that approval, with the private infrastructure already healthy and the original reviewer
instance stopped through its own launcher, explicitly recreate **only** the selected app containers
so Compose remounts the new origin/Caddy secrets. Do not recreate data services or volumes:

```bash
# UNIVERSITY_PROJECT is the reviewed docversity-university-<nonce> from instance.json.
public_compose() {
  docker compose --project-name "$UNIVERSITY_PROJECT" \
    -f "$UNIVERSITY_DIR/public-candidate/compose.json" "$@"
}
public_compose up --no-build --no-deps --force-recreate -d --wait api
public_compose up --no-build --no-deps --force-recreate -d --wait web
public_compose up --no-build --no-deps --force-recreate -d --wait proxy
```

Before real data/access: on failure stop only the new public stack, restore its private loopback
configuration if useful, and restart the old reviewer via its own `staging.py up`; keep every volume.
After real university writes: **never route users to the old synthetic database as a data rollback**.
Fail closed/maintenance, retain the university DB/objects and roll back compatible application images
on that same instance. Schema/data restore or cross-version rollback requires a separately reviewed
recovery decision and verified backup. No destructive downgrade/volume removal is provided here.

## Encrypted off-host backup and recovery plan

Owner approval is still required for destination, recipients/key custody, retention, RPO/RTO and
restore operator. Private local secret files and volumes are not an off-host backup.

For this **new** project's Compose only: stop ingress/API/web, gracefully stop worker, verify worker
exit 0/no OOM and run `backup-readiness` (refuse pending/delayed/retry/active jobs; do not flush Redis).
Take an owner-role PostgreSQL custom dump of **docversity_university**, mirror the private
**docversity-university** bucket with `storage-tools` to a new 0700/0600 backup directory, and record
per-file SHA-256 plus release/image/schema manifest. Include the independent secrets and Redis
recovery policy; never use reviewer bucket/DB names in these commands. Restart and check only this
instance. Queue emptiness at a stopped worker is necessary; it is not a complete production job-drain
or Redis disaster-recovery guarantee. Validate this operation under the actual university workload.

Encrypt the full recovery set with a reviewed tool such as age to the backup owner's public
recipient; keep the private identity/key separately. Transfer only encrypted payload + integrity
manifest to the approved off-host destination through an authenticated channel. Prove decryption,
checksums, restore, counts and private-object equality in a third isolated recovery project with
fresh credentials/volumes and no public listeners. Never restore into `docversity14h`, its retained
restore-test volumes, development or the live university DB. Preserve existing recovery resources.
No real backup encryption/upload/restore or off-host acceptance is claimed here.

Operator command reference for an approved, quiescent **university** instance (never the reviewer):

```bash
umask 077
# Use the active private/public Compose file and reviewed university project for this function.
university_compose() {
  docker compose --project-name "$UNIVERSITY_PROJECT" -f "$ACTIVE_COMPOSE_FILE" "$@"
}
university_compose stop proxy web api
university_compose stop worker
# Verify worker exit 0 and no OOM first; then require queue-readiness success.
university_compose --profile operator run --rm --no-deps backup-readiness
# BACKUP_RUN is a new operator-approved timestamp directory under the private backups folder.
mkdir -m 700 "$UNIVERSITY_DIR/backups/$BACKUP_RUN"
university_compose exec -T postgres pg_dump -U docversity_owner \
  -d docversity_university --format=custom --no-owner --no-acl \
  > "$UNIVERSITY_DIR/backups/$BACKUP_RUN/database.dump"
university_compose --profile operator run --rm --no-deps storage-tools mirror \
  local/docversity-university "/backups/$BACKUP_RUN/objects"
```

Check dump and object manifest before reopening ingress. For restore, generate a fresh isolated
recovery project and start only its PostgreSQL/MinIO. Do not run migrations before loading a full
schema dump. Use `pg_restore --exit-on-error --no-owner --no-acl -U docversity_owner -d
docversity_university` against that empty recovery DB, restore only its private bucket, and verify
schema drift, table fingerprints and object hashes without printing record contents. Perform an
independent reviewer recovery exercise before admitting real records.

## Security and authorization checklist

- Fresh secrets/private parent directory, clean reviewed image-source SHA and complete immutable set.
- Original reviewer/development services, DBs, objects, volumes, credentials and backups untouched.
- No source workbook, identity values, account/activation secrets or photos in Git/logs/test fixtures.
- Source identity rejection occurs before storage; manual review still covers unlabeled data.
- Secure cookies, CSRF/origin checks, separate staff/student sessions, RBAC and object ownership intact.
- No fixture service or automatic accounts/academic seeding in clean configuration.
- Digital certificates remain free; only physical hard copies may use the separately reviewed payment
  integration. Real collection, signing, Rector approval, public disclosure and official issuance stay disabled.
- Actual master data, inactive mapping, session, identity linkage, import, activation distribution and
  live cutover each require institutional approval. No real records are admitted by this work.

## Verification and limitations

Final local command evidence is recorded after verification. Configuration rendering/unit tests are
not a production deployment certificate. No actual new university database/admin/import or live
backup/cutover is claimed complete. The original workbook and image archives remain preserved.

### Final local verification (11 November 2026)

| Check                                                                         | Actual result                                                                     | Exit |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---- |
| Format, lint, TypeScript                                                      | Passed; existing TanStack Table lint warning remains                              | 0    |
| Full `pnpm test --force`                                                      | 1,060 tests / 131 files passed, no test cache                                     | 0    |
| Targeted import/auth/bootstrap/profile integration                            | 62 passed; included in repository total                                           | 0    |
| Production `pnpm build --force`                                               | 11/11 tasks, 34.71 seconds                                                        | 0    |
| `pnpm db:check`                                                               | No difference detected                                                            | 0    |
| Targeted Playwright (admin auth, imports, student activation/portal, profile) | 12 passed, 0 failed/skipped, 112.72 seconds                                       | 0    |
| Clean configuration unit tests                                                | 7 passed                                                                          | 0    |
| Private/public Compose render and network-disabled Caddy adapt                | Passed; no stack startup or TLS issuance                                          | 0    |
| Native synthetic clean bootstrap                                              | 21 migrations, empty academic DB, then one Super Admin with one role/audit record | 0    |
| Graphify                                                                      | Three required artifacts refreshed                                                | 0    |

No application assertions or deadlines were weakened. The first full run was interrupted by a
confirmed clamshell sleep at 22:53:34 IST on 10 November; its API portion reported 451 passes, nine
failed tests and 28 skipped. After wake, isolated SQL/Redis/MinIO checks passed and the final complete
uncached suite exited 0 in 262.41 seconds. An initial browser assertion matched both the real error
alert and the Next.js route announcer; only the selector was narrowed, and the same twelve tests
then passed. The 5,000-row import performance case passed with normal validation and commit.

Fresh configuration generation/rendering used the preserved manifest only to verify structure and
pins. It did not start a new production stack or certify the previous images for this change. The
native bootstrap rehearsal used an isolated synthetic DB; no real account or record was created.
The complete new Hostinger stack still requires the reviewed candidate SHA, fresh immutable images,
authorized host/TLS operations and encrypted recovery acceptance.

Compared all 21 original container identities, configuration, mounts, ports and start times; no
changes. All 41 original Docker volumes remain present. No original data or bucket was accessed.
The source workbook checksum and frozen release archive sizes/read-only modes are unchanged.
No commit, push, PR, external deployment, real import or payment activation occurred.
