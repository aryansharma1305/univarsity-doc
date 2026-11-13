# Separate encrypted backup and isolated recovery

Future operator procedure only. No backup, cloud transfer, database restore, live Docker operation
or alert installation was executed by this branch. Accept this procedure with the university owner
before real workbook upload; an application preview already stores personal data.

## Ownership and recovery objectives

Use separate staging/university backup identities, off-server prefixes and encryption recipients.
The destination must be outside this VPS and independently administered. The VPS upload identity
must not purge previous generations; use destination-side retention/immutability. Keep decryption
identities with approved custodians off the VPS, with a tested second-person recovery path.

Approve retention, schedule, recovery operator, RPO and RTO. Starting proposals: nightly backup,
RPO 24 hours, RTO 4 hours, 14 daily/8 weekly/12 monthly copies, and a fresh recovery point before
imports/upgrades. These are not achieved SLAs or approved data-retention rules. If a shorter RPO is
needed, design/test coordinated database/object recovery instead of promising it from nightly dumps.

Capture PostgreSQL custom dump, private object bytes, per-file checksums, aggregate table/schema
fingerprints, migrations/checksums, release/image identities, capture time and a separate encrypted
secret escrow. Include enough configuration to recover but never automatically reuse staging keys.
An encrypted source-code/image artifact is not a database/object backup.

## Staging capture

Use the original staging private state and approved active image tag. Before shared-edge adoption,
the existing backup temporarily stops its own proxy; schedule that interruption. After adoption,
the updated launcher stops only staging web/API/worker and leaves the shared edge/university alone:

```bash
cd "$STAGING_SOURCE"
python3 deploy/scripts/staging.py backup
```

Require clean worker exit/no OOM, successful readiness, database dump, private object mirror and
manifest. Preserve all original generations and existing restore volumes. Upload only an encrypted
complete recovery set to the staging destination. The old launcher must not run after adoption.

## University capture

Use the exact `u()` function, university project and web service from the coexistence guide. Confirm
identity/mounts before running. Quiesce producers and schedules, close only university ingress for
maintenance, stop API/web, gracefully stop worker and refuse pending/delayed/retry/failed/paused/
scheduled work or processing imports. Never flush Redis or remove jobs to pass readiness.

```bash
set -euo pipefail
umask 077
: "${BACKUP_RUN:?New UTC name, for example YYYYMMDDTHHMMSSZ}"
[[ "$BACKUP_RUN" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]
BACKUP_SET="$UNIVERSITY_DIR/backups/$BACKUP_RUN"
test ! -e "$BACKUP_SET"
mkdir -m 700 "$BACKUP_SET"
resume_university() {
  capture_exit=$?
  trap - EXIT
  if ! u up --no-build --no-deps -d --wait api; then
    printf '%s\n' 'University API restart failed; keep maintenance and escalate' >&2
    exit 1
  fi
  if ! u up --no-build --no-deps -d --wait worker "$UNIVERSITY_WEB"; then
    printf '%s\n' 'University worker/web restart failed; keep maintenance and escalate' >&2
    exit 1
  fi
  exit "$capture_exit"
}
# Use a dedicated operator shell so the EXIT trap covers every capture failure.
trap resume_university EXIT
u stop "$UNIVERSITY_WEB" api
u stop worker
worker_id="$(u ps --all --quiet worker)"
test -n "$worker_id"
test "$(docker inspect --format '{{.State.ExitCode}} {{.State.OOMKilled}}' "$worker_id")" = '0 false'
u --profile operator run --rm --no-deps backup-readiness
u exec -T postgres pg_dump -U docversity_owner -d docversity_university \
  --format=custom --no-owner --no-acl > "$BACKUP_SET/database.dump"
test -s "$BACKUP_SET/database.dump"
u --profile operator run --rm --no-deps storage-tools mirror \
  local/docversity-university "/backups/$BACKUP_RUN/objects"
```

Before leaving this shell, add approved release/schema/image records and aggregate database
fingerprints while writers remain stopped. For each application table capture count and a stable
ordered row-content hash without outputting records; reuse the existing staging fingerprint algorithm
against **this university database** in the reviewed capture process. Store these privately inside
the encrypted set. Record any failed capture as failed; never publish a success marker for a partial dump.

After separate escrow approval, include the independent runtime secrets under the private recovery
set or encrypt escrow separately. Do not print them, place them in argv, or copy another environment's
files. Per-file integrity manifest example (content hashes only):

```bash
python3 - "$BACKUP_SET" <<'PY'
import hashlib, json, pathlib, sys
root=pathlib.Path(sys.argv[1])
files={}
for p in sorted(root.rglob('*')):
    if p.is_symlink(): raise SystemExit('Symlink in recovery set refused')
    if p.is_file() and p.name!='manifest.json':
        with p.open('rb') as source:
            files[str(p.relative_to(root))]=hashlib.file_digest(source,'sha256').hexdigest()
(root/'manifest.json').write_text(json.dumps(files,indent=2)+'\n')
PY
```

Exit the capture shell after the complete local snapshot/manifest is sealed, to run its restart trap
and verify university health before encryption/transfer. Snapshot files are no longer written by the
application, so writers need not stay stopped during off-server transfer. Run the next section in a
separate approved operator shell using the recorded BACKUP_SET/BACKUP_RUN. Healthy application restart
does not make a failed capture acceptable. Only one 512-MiB operator job may run within the proposed
budget; use an approved systemd scope with MemoryMax=512M, MemorySwapMax=0 and CPUQuota=10% for host
encryption/transfer, and stop approved unused recovery containers before a restore.

## Encryption and transfer

Approve/install the chosen tools separately. `age` and a restricted authenticated `rclone` remote
are references, not dependencies installed or credentials configured by this branch. The recipient
is public; its private identity must not be kept alongside the VPS backup.

```bash
: "${BACKUP_RECIPIENT:?Approved public age recipient}"
: "${OFFSITE_DEST:?Independent authenticated university destination directory}"
ENCRYPTED_SET="$UNIVERSITY_DIR/backups/$BACKUP_RUN-encrypted"
mkdir -m 700 "$ENCRYPTED_SET"
tar -C "$BACKUP_SET" -cf - . | age -r "$BACKUP_RECIPIENT" \
  -o "$ENCRYPTED_SET/recovery.tar.age"
cd "$ENCRYPTED_SET"
sha256sum recovery.tar.age > SHA256SUMS
rclone copy . "$OFFSITE_DEST/$BACKUP_RUN"
rclone check . "$OFFSITE_DEST/$BACKUP_RUN" --one-way
```

Check every exit and remote integrity/version reference; never mark an unsuccessful upload as backed
up. University writers were already resumed after the sealed local capture. Keep staging untouched
throughout. A nightly timer must serialize captures, alert on refusal/failure,
record last successful verified off-site copy, enforce retention at the destination, and prevent
overlap with imports/restore/patch work. Delivery and alert ownership are launch gates; no timer is
installed here. Do not delete local/plaintext sets until verified off-site recovery and approved
retention decisions; alert on local disk growth.

## Isolated restore

An independent operator retrieves a retained encrypted set, verifies the protected expected
ciphertext checksum/version, decrypts on an approved recovery host using the off-VPS identity,
and validates every internal checksum. Inspect archive paths/types before extraction into a fresh
0700 directory; reject absolute/traversal/symlink entries. Do not extract untrusted paths as root.
Never restore into active university, staging or retained staging recovery volumes.

Generate a fresh recovery configuration with new project/credentials, using the matching reviewed
source and manifest. `--shared-proxy` supplies no listener, and its nonce network is not attached to
the live edge. Do not point an edge bundle at this recovery project. Do not apply migrations before
loading the full schema dump:

```bash
: "${RECOVERY_DIR:?Fresh private directory, different from UNIVERSITY_DIR}"
test "$RECOVERY_DIR" != "$UNIVERSITY_DIR"
cd "$CONTROL_SOURCE"
python3 deploy/university/clean.py prepare --shared-proxy \
  --directory "$RECOVERY_DIR" --origin https://recovery.example.invalid \
  --images "$RELEASE_DIR/images.json"
RECOVERY_PROJECT="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["project"])' "$RECOVERY_DIR/instance.json")"
test "$RECOVERY_PROJECT" != "$UNIVERSITY_PROJECT"
r() { docker compose --project-name "$RECOVERY_PROJECT" -f "$RECOVERY_DIR/compose.json" "$@"; }
# Check every generated volume name is unused before starting; refuse any collision.
r up --no-build -d --wait postgres redis minio
# RECOVERY_SET is the approved decrypted set; objects are placed under recovery backups only.
r exec -T postgres pg_restore --exit-on-error --no-owner --no-acl \
  -U docversity_owner -d docversity_university < "$RECOVERY_SET/database.dump"
r --profile operator run --rm --no-deps storage-tools mirror \
  "/backups/$RECOVERY_RUN/objects" local/docversity-university
```

Require migration/schema equality, every table fingerprint/count and private-object byte hash,
constraints/grants, negative cross-environment access and a measured recovery time. Repeat with
deliberate integrity failures and prove refusal. A successful container start is not restore proof.
Do not run `check-empty` against a restored database: it is expected to contain the recovered records.

Keep fresh recovery service credentials and empty Redis. Existing staff/student password hashes
remain in the restored DB, but old sessions must not be replayed. Keep a fresh session/HMAC secret
and explicitly reissue activation codes under university control, so consumed post-backup codes
cannot silently become usable again. Do not restore old queues or clear in-flight work without the
approved recovery decision. The empty-queue capture invariant must be proven; otherwise implement
and rehearse coordinated Redis recovery before launch. Existing readiness refusal is not full DR.

Only an approved cutover can expose recovered data. Reconcile all writes since the recovery point,
record RPO/RTO, independent reviewer, object/table equality, credential handling and discrepancies,
then retain the isolated volumes for inspection. Do not remove prior recovery targets for a repeat.
The actual off-server destination, keys, restore rehearsal and recovery evidence remain pending.
