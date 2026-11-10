# Hostinger operator runbook

Prepared 10 November 2026 against `d791afd7da3b0efc2db7965cc3a2fa6417a90d60`.
**No VPS, DNS, ACME or deployment operation has been performed.** The isolated native recovery
checkpoint below is separate from full-stack launcher acceptance.
This operates a separately authorized, protected **synthetic university-review instance**, using
existing 14A/B infrastructure. It does not authorize university-record loading or official operations.
Phase 15A must be reviewed, merged and included in the release before reviewer access.

## Release and host prerequisites

Record the reviewed Git SHA, successful CI URLs on that SHA, target architecture, image identities,
operator, domain, maintenance window and rollback candidate in the private handover record. Reject
dirty builds or moved tags. Never transfer another worktree's `.local`, `.env`, database, objects or
credentials. Use the existing [14A installation procedure](phase-14a-deployment-readiness.md#future-ubuntu-vps-runbook--preparation-only).
No hosting alternative is needed.

The owner supplies Ubuntu VPS access, approved operator SSH keys/admin source IPs, recovery console,
domain and ACME contact. Verify a second key login before tightening SSH access. Compose must support
the public overlay's `!override` tag. Only Caddy may publish ports: 80/443 publicly, with SSH restricted
to operator addresses. Validate Docker-published ports separately from firewall rules. Database,
Redis, MinIO, API and Next.js must have no public listeners. No Docker socket in application containers.

Before initialization on the future authorized VPS, collect this non-mutating preflight output in the
private operator record. These commands are references, not operations performed on a real host:

```bash
uname -m
cat /etc/os-release
free -h
df -h
df -i
docker version
docker compose version
python3 --version
git status --short
git rev-parse HEAD
python3 deploy/scripts/check-config.py
```

Require the approved Ubuntu release and architecture, a clean reviewed checkout, matching release
SHA, healthy local Unix-socket Docker engine and compatible Compose. Ensure sufficient memory/disk
for the selected immutable images, application, Chromium and retained backups/upgrades; nominal KVM 2
resources are not a measured capacity guarantee. Stop on failed configuration assertions or
insufficient headroom. `check-config.py` validates the existing base/review/public Compose merge
without starting services; run with its default project/port environment, before setting instance
overrides. It does not certify credentials, the live firewall, HTTPS or queue recovery.

Use a dedicated checkout and unused project such as `docversity14h`; inspect existing project/container/
volume names first. **Never reuse Phase 14A–14E projects/volumes or an existing `.local/staging`.**
The launcher accepts only `docversity14<letter>`. Keep each checkout and its instance files together:
changing directories can select a different stack. Staging DB/bucket names can match because the
service instances, networks and volumes are separate. Real records must never enter this demo.

## One-time initialization

These are command references for a future authorized host, not commands executed during preparation.
Replace the example domain/email only after approval; do not request certificates for the example
domain or run public startup on this Mac.

```bash
umask 077
python3 deploy/scripts/init-local.py --project docversity14h --https-port 3448 \
  --public-origin https://review.example.invalid --acme-email operator@example.invalid
python3 deploy/scripts/staging.py review-init
```

Initialization refuses an existing secret directory. It creates independent bootstrap/owner/runtime
DB credentials, Redis credentials, session key, storage keys and synthetic reviewer credentials.
The host parent is private; files are read-only for non-root container access. Compose secret files
are not encrypted storage. Protect an encrypted recovery copy and key custody. Never print secrets,
pass them in shell arguments, paste them in reports or commit them. Reinitialization is not rotation.

`review-init` hashes the gate password through Caddy without plaintext in argv. The gate must remain
a regular read-only file in its validated format. Missing/writable/malformed gates block startup.
**All review/public lifecycle operations must use `staging.py`, never direct Compose startup.**

Reference variable templates are [API](../../deploy/env/api.env.example),
[worker](../../deploy/env/worker.env.example) and [web](../../deploy/env/web.env.example). They show the
existing production-mode synthetic-review topology and least-privilege separation. Credentials are
deliberately empty so the examples cannot start the API/worker successfully. Keep the initializer as
the source of private runtime files; do not overwrite working instance files with these examples.
The `staging` queue/session prefix matches the current Redis ACL. Changing it requires coordinated
ACL, API and worker changes, not a template-only edit. No template enables official operations.

## Images and startup

Build the existing `api`, `worker`, `web`, `tools` targets from the approved release for the VPS
architecture. The API requires Chromium for synthetic PDFs; do not replace it with a reduced image.
Record resolved image IDs/digests. Local ARM64 evidence does not certify AMD64 capacity. Dependency
images remain pinned in `deploy/compose.yml`; no new registry or deployment topology is introduced.

```bash
export IMAGE_TAG="$(git rev-parse HEAD)"
python3 deploy/scripts/staging.py build
```

This names images `docversity14h-{api,worker,web,tools}:<SHA>` for the selected instance. If built
elsewhere, transfer/load those exact names and architecture through the approved image-distribution
procedure, recording immutable identities. Keep `IMAGE_TAG` identical for subsequent commands.
Builds are resource-intensive: on a laptop, assess battery margin, thermal condition and sleep risk before starting; monitor the run and use AC power when available.

After image preparation, run `python3 deploy/scripts/staging.py preflight` with the same `IMAGE_TAG`.
The launcher requires an initialized public review instance and a valid gate. It checks Ubuntu 24.04,
a local Unix-socket Docker engine, Compose availability, a clean full-SHA checkout matching `IMAGE_TAG`,
at least two CPUs, 6 GiB detected RAM and 10 GiB free release-filesystem space, then validates Compose.
Public `up` repeats this non-mutating preflight automatically. These are refusal thresholds, not a
capacity certification; synthetic PATH-based tests exercise them without contacting a VPS.

Only after explicit release/deployment/DNS/ACME authorization:

```bash
python3 deploy/scripts/staging.py up
python3 deploy/scripts/staging.py fixture
python3 deploy/scripts/staging.py review-fixture
python3 deploy/scripts/staging.py smoke
python3 deploy/scripts/staging.py status
```

The instance definition selects base + reviewer + public overlays; only Caddy publishes 80/443.
`up` uses `--no-build`, initializes a fresh DB and applies reviewed migrations using the owner
connection before API startup. Runtime roles cannot perform DDL. Fixture commands are **only for
the dedicated synthetic instance**, never existing real-data deployments or account migration.

The public Caddyfile is **`Caddyfile.review-public`**, importing `review-site.caddy` and the private
gate. Do not substitute the older ungated `Caddyfile.production`. The reviewer site enforces 16 MiB
request bodies, noindex and replacement of untrusted forwarding headers. The fixed Caddy → Next →
API route uses `TRUST_PROXY=2`; adding a CDN, tunnel or direct API listener requires trust-boundary
review. Require secure cookies, exact HTTPS WEB_URL/CORS_ORIGINS, Swagger off and private storage.
The web receives no DB/session/storage secrets; the worker receives no session-signing secret.

The launcher probes the gate after startup and stops the proxy on failure. Independently confirm
anonymous/wrong gate credentials cannot reach application/API/download/health paths; only robots.txt
is exempt. Internal readiness port 8081 is not published. Verify IPv4/IPv6 exposure and real HTTPS
renewal/restart behavior on the actual host before claiming it live.

Acceptance requires all services healthy, DB/Redis/storage round-trips, queue health, cross-role and
object-ownership denial, CSRF/rate limits, secure cookies, no secret leakage and integrated browser/UAT
results on the exact release. Historical 14B results are not final-candidate evidence. Pre-15A unbound
staff/student sessions require re-login. Distribute credentials only after acceptance and approval.
All four real public verification services stay UNAVAILABLE; unpublished/legacy-only results remain
hidden. Official issuance/signing, Rector operations and live payments remain disabled. Sample PDFs
retain fictional data, SAMPLE and unsigned signatures.

## Read-only operations

Start with `staging.py status`. Diagnostic Compose commands must use the same project and overlays;
set the non-secret PUBLIC_DOMAIN/ACME_EMAIL to the approved instance values in that shell:

```bash
docker compose --project-name docversity14h -f deploy/compose.yml \
  -f deploy/compose.review.yml -f deploy/compose.public.yml logs --tail 100 api worker web proxy
docker stats --no-stream
df -h
df -i
```

Use Compose here only for diagnostics, not lifecycle. Do not publish raw environment/config/inspect
output, cookie jars, private runtime files or query-string credentials. Inspect bounded logs locally
and share redacted findings. Assign alert ownership for unhealthy/restarting services, queue backlog/
failures, PDF errors, memory/swap, disk/inodes and backup age. Set thresholds against measured capacity.
Existing log rotation is not a capacity test or incident-response procedure.

## Backup and isolated recovery

During an approved interruption window, on synthetic staging only:

```bash
python3 deploy/scripts/staging.py backup
python3 deploy/scripts/staging.py restore-test BACKUP_DIRECTORY_NAME
```

Backup stops proxy/web/API and gracefully stops the worker under its existing five-minute grace
period. It now requires the actual worker container to have exited 0 without OOM, then runs the
worker readiness CLI with that instance’s private runtime. The one-shot `backup-readiness` operator
service reuses the worker image with its healthcheck explicitly disabled, so verification cannot
enqueue a new health-test job. The CLI refuses queued, active, delayed,
prioritized, waiting-child, repeat-scheduled, failed or paused work, or UPLOADED/VALIDATING/PROCESSING
imports. Redis/DB errors and its 15-second deadline also refuse the backup. No job is deleted, retried
or silently discarded. Only an empty resumable-work set permits the DB dump and private object mirror;
a SHA-256 manifest is written only after both succeed. The launcher restarts through the gate even
when readiness or capture fails. Inspect/reconcile unfinished work, let the normal worker recover it
and retry; do not prune queues to obtain a passing backup.

**This conservative refusal gate is not yet a production-grade BullMQ drain/recovery strategy.**
The worker Redis tests cover refusal, graceful close and preserving work for restart. An isolated
native rehearsal restored all 46 application tables, identical functions/triggers and private object
bytes, with constraint metadata/positive/negative controls and restricted-role reads. The Python
launcher changes and complete final-candidate staging/rollback rehearsal still require runtime validation.
Redis is not included in this backup. Real-data operation still requires coordinated producer
quiescence, scheduler handling, bounded drain/recovery, crash/retry/import-checkpoint evidence and an
approved Redis recovery decision. Stopping writers alone never certifies that every job completed.

Restore uses `<project>-restore`, refuses existing recovery volumes and compares table fingerprints
and object bytes. Never overwrite the active instance. Recovery volumes remain for inspection; do
not delete prior targets to make a repeat pass. A repeat needs a reviewed fresh isolated target.
Verify exact exits and fingerprints rather than container status alone.

Before real use, approve RPO/RTO, retention, encryption, off-host destination, key escrow, backup
schedule, alerts and restore frequency. A manifest does not replace encryption or an independently
protected copy. This runbook installs no backup schedule or off-host upload. Preserve existing backup
and incident material.

## Upgrade, stop and rollback

Record current SHA/image identities and verify a usable recovery path before upgrading. Review
migration compatibility before `up`, which applies migrations automatically. Never reset, seed or use
down-with-volumes against an existing instance. Retain its instance identity, secrets and volumes.

```bash
python3 deploy/scripts/staging.py stop
# Select only reviewed compatible release/images and their recorded IMAGE_TAG.
python3 deploy/scripts/staging.py up
python3 deploy/scripts/staging.py smoke
```

These are command references, not automatic rollback. Retain old images/volumes. Application rollback
requires approved schema/security compatibility. **Never revert to known vulnerable pre-15A auth.**
Do not downgrade schema or overwrite live databases automatically. Incompatible rollback requires
approved isolated restore/cutover accounting for records written after the backup. On uncertain
integrity or gate failure, keep the proxy stopped and preserve evidence.

## Evidence and remaining activation requirements

Runbook preparation and the isolated native recovery checkpoint are complete; final-image builds,
launcher startup, full-stack backup/restore/rollback and host acceptance remain unexecuted. See the
[combined verification report](../final-handover/02-integration-verification.md) for exact test evidence.
Record host resources/architecture, release/CI/image identities, gate/ports/HTTPS acceptance, synthetic
UAT, queue recovery, backup/restore, monitoring and restart results before operational acceptance.
Outstanding external inputs: VPS allocation/access, domain/DNS/ACME approval, off-host destination/key
custody, RPO/RTO, monitoring owner, university policies and MinIO hosted-use licensing approval.
No remote deployment, credentials, real data or volumes changed during this preparation.
