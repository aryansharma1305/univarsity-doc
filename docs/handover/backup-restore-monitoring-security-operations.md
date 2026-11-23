# Backup, restore, monitoring and security operations

- **Audience:** the production operator, the second recovery custodian, the university's IT/security
  contact.
- **Scope:** backups and their encryption, restore tests, monitoring and alerting, SSH hardening,
  recovery-key custody, CSP, and the application security controls operators must preserve.
- **Applies to release `916b07c`.**

Source: [deploy/ops/README.md](../../deploy/ops/README.md) and its runbooks
([backup](../../deploy/ops/backup/RUNBOOK.md), [alert](../../deploy/ops/alert/RUNBOOK.md),
[ssh](../../deploy/ops/ssh/RUNBOOK.md), [custody](../../deploy/ops/custody/EMERGENCY-ACCESS.md),
[CSP](../../deploy/ops/csp-rollout.md)), [shared-proxy-recovery.md](../development/shared-proxy-recovery.md),
[phase-14a-deployment-readiness.md](../development/phase-14a-deployment-readiness.md).

**Status caution.** The ops kit runbooks record state "on 2026-11-19" and say "Nothing here has been
applied". Whether any part (backup timer, encryption, alerting, SSH hardening, second custodian) has
been applied since is **not verified** in this repository. The operator must confirm each item in the
sign-off checklist.

## 1. Backups

**What a backup set contains** (`deploy/ops/backup/capture.sh`):

- worker readiness check first (refuses if queued, active, delayed, failed or paused jobs, or
  imports in progress, exist; jobs are never deleted to pass);
- PostgreSQL custom-format dump (`pg_dump -Fc`) as the owner role;
- `tables.json`: per-table row count and content hash;
- private object mirror (MinIO bucket);
- Compose/instance/image identity files and a copy of runtime secrets (includes the
  `STAFF_MFA_ENCRYPTION_KEY` escrow);
- `metadata.json` (source SHA, time, aggregate counts) and a SHA-256 `manifest.json`.

A failed run removes its partial set. Output lines contain counts and paths only. Redis is **not**
backed up.

**Encryption and off-server copy (designed, apply needs approval):**

1. `encrypt-backup.sh <set>` encrypts to the custody **public** key only (private key never on the
   VPS) and writes `<ts>.tar.gpg` + `.sha256`.
2. `pull-verify.sh` (operator workstation) copies new ciphertexts, decrypts with the custody key,
   checks every file against the manifest and marks the set off-server verified on the VPS.
3. `prune-backups.sh` (dry run unless `--apply`) deletes a plaintext set only after its verified
   ciphertext exists off-server; keeps the newest 14 encrypted sets.
4. Daily schedule: `docversity-backup.timer` (`backup-daily.sh`).

**Retention proposal (decision D4, not approved):** VPS plaintext none once verified; VPS encrypted
14 daily; off-server 30 daily, then monthly for 12 months, pre-release captures 1 year; weekly copy to
a second custodian/location. Starting RPO/RTO proposals: RPO 24 h, RTO 4 h (not achieved SLAs).

## 2. Restore tests

- Always restore into a **separate** project and new volumes; never over the active instance.
- Compare table fingerprints (`tables.json`) and object bytes; verify exact exit codes, not just
  container status. `deploy/scripts/verify-restore.mjs` performs the comparison in the staging
  tooling.
- Every release's prep step performs an isolated DB + MinIO restore test and a migration rehearsal
  on the restored copy (see the deployment runbook).
- Keep recovery volumes for inspection; a repeat needs a fresh isolated target.
- Record date, backup ID, result and operator in the private record. Agree a restore-test frequency
  (decision).

## 3. Monitoring and alerting

`deploy/ops/alert/healthcheck.sh` every 5 minutes (systemd timer), read-only:

| Check                               | Default threshold       |
| ----------------------------------- | ----------------------- |
| Uptime (public homepage)            | not HTTP 200            |
| Containers (7 services)             | not running and healthy |
| TLS expiry                          | < 21 days               |
| API 5xx / error-level logs (10 min) | > 5 each                |
| 429 spike                           | > 30                    |
| CSP reports                         | > 50                    |
| Disk / inodes                       | > 85%                   |
| Newest encrypted backup             | older than 26 h         |
| Backup job                          | failed                  |
| Plaintext set age                   | older than 192 h        |

Alerts carry counts only; an external heartbeat (dead-man's switch) catches a dead VPS or stopped
timer. Notification channel (decision D2) is open: `log`, `webhook`, `ntfy`, `telegram`, `email`
(needs an MTA). API `/health` checks the database, Redis and storage.

## 4. Access and key custody

- **SSH:** key-only access, restricted source addresses; `deploy/ops/ssh/00-docversity-hardening.conf`
  with gates and rollback in its runbook. Verify a second key login before tightening.
- **Firewall:** only Caddy publishes 80/443. PostgreSQL, Redis, MinIO, API and Next.js have no public
  listeners. Docker-published ports can bypass UFW; validate from outside.
- **Custody:** one operator currently holds every recovery secret (per the custody runbook). Add a
  second custodian (decision D3), move the custody passphrase into a password manager, and test
  break-glass access. Loss of the custody key makes every off-server backup unreadable; loss of
  `STAFF_MFA_ENCRYPTION_KEY` forces an access reset for every enrolled staff member.
- Staff access recovery: Super Admin reset (`/api/v1/staff-users/:id/access-reset`) or the CLI
  `pnpm staff:reset-access`.

## 5. Application security controls to preserve

- Production must use a random `SESSION_SECRET`, `COOKIE_SECURE=true`, `SWAGGER_ENABLED=false`, an
  exact HTTPS `WEB_URL`/`CORS_ORIGINS`, `TRUST_PROXY=2` for the Caddy → Next → API path, and a
  `STAFF_MFA_ENCRYPTION_KEY` different from `SESSION_SECRET`.
- The web container receives no database, session or storage secrets; the worker receives no session
  signing secret. Runtime secrets are files mounted read-only and loaded by `launch.mjs`.
- Sessions in Redis; authentication fails closed (503) when Redis is down. CSRF on every unsafe
  request; login and MFA rate limits; audit log append-only (database trigger).
- Logs are structured JSON with sensitive keys redacted (including `verificationUrl`).
- **CSP:** stage 1 enforces a baseline policy and reports a strict nonce policy; stage 2 (enforce
  strict) is a separate PR. Rollback is the previous web image.
- Never log or paste passwords, session IDs, CSRF/reset tokens, activation codes, QR credentials or
  storage/database credentials.

## 6. Routine operator tasks

| Frequency          | Task                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------- |
| Daily              | Check alerts/heartbeat; confirm the newest backup and its off-server verification      |
| Weekly             | `pull-verify.sh`; `prune-backups.sh` review and `--apply`; disk and log volume review  |
| Each release       | Prep script (backup + isolated restore + migration rehearsal), release wrapper, record |
| Monthly (proposal) | Isolated restore test from an off-server copy                                          |
| On staff change    | Disable leaving staff accounts; reset access where needed                              |
