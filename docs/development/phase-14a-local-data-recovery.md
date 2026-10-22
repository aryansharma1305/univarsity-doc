# Infrastructure issue — Phase 14A private `.local` data lost (22 October 2026)

Status: **outstanding operational recovery task**. Nothing has been recovered and no recovery step
has been executed. On 22 October the owner instructed that Phase 14A's running containers and
volumes be preserved, and that nothing be restarted, no credential extracted, and no password or
database user rotated or reset without separate authorization. This is a local development
infrastructure issue. No university data is involved: Phase 14A staging holds only synthetic
records.

## What happened

- **Earlier on 22 October:** `docversity-phase14a/.local/` existed (mode 0700) with `backups/`,
  `evidence/` and `staging/`. It was observed while Phase 14B started.
- **Shortly after:** a disk-space cleanup on the Mac ran
  `find /Users/gugloo/Docvarsity -maxdepth 2 -name node_modules … -exec rm -rf` and removed several
  worktrees. Phase 14B did not run the cleanup; it only observed it.
  - Removed worktrees include `docversity-phase14a`, `docversity-phase12c1`,
    `docversity-ui04-integration` and others.
  - Five worktrees remain: `docversity`, `docversity-phase13a`, `docversity-phase14b`,
    `docversity-ui02` and `docversity-ui04`.
- **When Phase 14B's testing window opened:** `docversity-phase14a/` no longer existed, so neither
  did its untracked `.local/` directory.
- **Effect on the running stack:** Phase 14A's containers kept running. Their healthchecks read
  Compose secret files from the deleted bind sources, so `docversity14a-minio-1`,
  `docversity14a-redis-1` and `docversity14a-worker-1` report **unhealthy** (for example,
  `cat: can't open '/run/secrets/redis_password'`).

## What was lost

| Item                                               | Contents                                                                                                                                                                                                                      | Recoverable?                                                                                                                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.local/staging/` (12 files, from `init-local.py`) | `runtime`, `worker_runtime`, `web_runtime`, `migration_runtime`, `database_bootstrap_password`, `database_owner_password`, `database_app_password`, `redis_password`, `redis_config`, `minio`, `fixture.json`, `local-ca.crt` | **Partly**, from running process memory and the Caddy volume (below)                                                                                                          |
| `.local/backups/` (2 entries)                      | The Phase 14A consistent backup (`database.dump`, object mirror, SHA-256 `manifest.json`) and its `restored-<timestamp>` comparison copy                                                                                      | **The files are gone.** Equivalent content survives in the retained `docversity14a-restore_postgres_data` and `docversity14a-restore_minio` volumes                           |
| `.local/evidence/` (45 entries)                    | Local verification evidence for PR #21 (logs and captures)                                                                                                                                                                    | **No.** Only a count was recorded, so the individual files can't be listed. The merged report (`phase-14a-deployment-readiness.md`) and GitHub Actions logs for PR #21 remain |
| The worktree itself                                | Code and docs                                                                                                                                                                                                                 | **Yes.** It is tracked in Git: merged to `main` (PR #21), and the local branch `feature/phase-14a-deployment-readiness` at `488db9d` still exists                             |

No Trash copy was found, and there are no Time Machine backups ("No machine directory found").

## What survives (verified read-only on 22 October)

**Volumes, unchanged during Phase 14B:**

- `docversity14a_postgres_data`: 40 tables, fingerprints identical before and after.
- `docversity14a_minio`: object data byte-identical; only MinIO's own metadata changes.
- `docversity14a_redis`, `docversity14a_caddy` and `docversity14a_caddy_config`.
- The restore-rehearsal, init-check and QA volumes.

**Secrets still held in running process memory.** These are **key names only**; no value was read
out or printed:

| Container                | Keys present in a process environment                                                         | Rebuilds                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `docversity14a-api-1`    | `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `WEB_URL`, … | `runtime`, `database_app_password` (from the URL), `redis_password` (from the URL) |
| `docversity14a-worker-1` | `DATABASE_URL`, `REDIS_URL`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, …                              | `worker_runtime`                                                                   |
| `docversity14a-minio-1`  | `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`                    | `minio`                                                                            |

**Deterministic from code:**

- `web_runtime`: no secrets.
- `redis_config`: `init-local.py`'s template plus the recovered Redis password.

**Exportable from the Caddy volume:** `local-ca.crt`, the public root certificate only.

**Not recoverable without changing credentials (approval required):**

- `database_owner_password`: used only by the exited migration container.
- `database_bootstrap_password`: PostgreSQL keeps only a hash.
- `fixture.json`: the synthetic staff and student passwords; the database keeps only hashes.

## Consequences

- **The in-memory copies are the only remaining source** of the runtime, worker and MinIO secrets.
  Stopping, recreating or restarting those containers loses them for good. That includes restarting
  Docker Desktop and rebooting the Mac.
- **The stack can't be restarted with `staging.py`**, because Compose needs the secret files. Even
  with recovered runtime secrets, `migrate` needs the owner password. The API waits for `migrate`, so
  the stack can't come up until the owner credential is reset (approval needed).
- **Phase 14A's backup/restore evidence now exists only as the report** and the retained recovery
  volumes. The original manifest that tied them together is gone.
- **The synthetic Phase 14A fixture accounts can't sign in** until their passwords are reset
  (approval needed).
- **Phase 14B is unaffected.** It has its own worktree, project, volumes and secrets
  (`docversity-phase14b/.local`), and mounts nothing of Phase 14A.

## Non-destructive recovery procedure (not executed; for the project owner to authorize)

These principles apply throughout:

- Never stop, restart or recreate `docversity14a-*` containers before step 4.
- Never print secret values: write them straight to a 0700 directory, with files at 0444.
- Never run `down -v`, `migrate reset`, `--clean` or `init-local.py` against the existing Phase 14A
  data. `init-local.py` would generate **new** secrets that don't match the volumes.

1. **Restore the worktree** (no data involved):
   `git worktree add /Users/gugloo/Docvarsity/docversity-phase14a feature/phase-14a-deployment-readiness`.
   Then create `.local/staging` (0700) and `.local/backups` (0700).
2. **Capture the in-memory secrets** with a reviewed script, never interactively:
   1. Read `/proc/<pid>/environ` of the Node child process in `docversity14a-api-1`, and write only
      the `runtime` keys that `init-local.py` defines to `.local/staging/runtime`.
   2. Do the same for `docversity14a-worker-1` → `worker_runtime`, and `docversity14a-minio-1` →
      `minio`.
   3. Derive `database_app_password` and `redis_password` from the captured URLs.
   4. Render `redis_config` and `web_runtime` exactly as `init-local.py` does.
   5. Run `docker compose cp proxy:/data/caddy/pki/authorities/local/root.crt` to recover
      `local-ca.crt`.

   Keep a SHA-256 manifest of the recovered files outside Git.

3. **Verify the recovered secrets read-only**, before any restart:
   - **Database:** connect as `docversity_app` with the recovered password and run `SELECT 1`.
   - **Redis:** `AUTH` as user `docversity` and `PING`.
   - **MinIO:** list the `docversity-staging` bucket with the recovered app keys.

   Any mismatch means **stop**: do not continue to step 4.

4. **Approval-gated, credential-changing steps.** Only with explicit approval, and only after a
   fresh backup (step 5):
   1. Reset `docversity_owner`'s password through the container's local socket as the bootstrap
      superuser, and write it to `database_owner_password` and `migration_runtime`.
   2. Optionally set a new bootstrap password the same way.
   3. Reset or replace the synthetic fixture accounts.

   Only then recreate the stack with `staging.py up`, and re-run `staging.py smoke`.

5. **Fresh backup.** Once the stack is healthy, run `staging.py backup` to create a new consistent
   backup and manifest. Then rehearse a restore into a new, explicitly reviewed recovery project; the
   existing `docversity14a-restore` volumes are retained, and the script refuses to overwrite them.
6. **Record evidence:** which secrets were recovered and which were reset, the verification results,
   and the new backup manifest. Store them outside the repository.

If recovery isn't wanted, the alternative is to leave Phase 14A's containers and volumes untouched as
an archive. Phase 14B supersedes it as the staging environment.

## Prevention

- Keep `.local/` (secrets and backups) **outside** worktree directories, or under a path that cleanup
  scripts exclude.
- Copy backups off the machine, encrypted, as the Phase 14A runbook already requires for production.
- Run cleanup scripts with a dry-run listing first, and exclude any path that contains `.local`.
- Phase 14B's own `.local` lives in `docversity-phase14b/` and is equally at risk. Before any further
  cleanup, its backups (`.local/backups/20261022T*`) should be copied somewhere safe.
