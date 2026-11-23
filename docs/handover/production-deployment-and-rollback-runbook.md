# Production deployment and rollback runbook

- **Audience:** the production operator (holder of VPS sudo access) and the university's technical
  contact who approves release windows.
- **Scope:** the established procedure for releasing a new main commit to the single production VPS
  and rolling the application back.
- **Applies to release `916b07c`** (the procedure is release-independent; placeholders are used).

Base documents: [phase-14a-deployment-readiness.md](../development/phase-14a-deployment-readiness.md)
(images, variables, rollback rule), [phase-14b-live-staging-deployment.md](../development/phase-14b-live-staging-deployment.md),
[phase-14c-render-staging.md](../development/phase-14c-render-staging.md),
[hostinger-operator-runbook.md](../development/hostinger-operator-runbook.md) (artifact verification),
[shared-proxy-coexistence.md](../development/shared-proxy-coexistence.md),
[shared-proxy-recovery.md](../development/shared-proxy-recovery.md), `deploy/`, `deploy/ops/`.

## Rules

1. **Operators run the sudo scripts themselves**, interactively on the VPS. No automation, CI job
   or assistant runs them, and nobody pastes their secret output into chat or tickets.
2. Deploy only a reviewed, merged main commit whose CI passed on that exact SHA, from the image
   artifact that CI produced. Never build on the VPS and never pull a moved tag.
3. **Rollback is image-only. The schema is kept.** Migrations are additive (new tables, columns,
   enum values, constraints). They are never reversed automatically, and an older backup is never
   restored over newer records. If a migration is not compatible with the previous images, rollback
   needs a separately approved isolated restore and cutover (data written after the backup would be
   lost otherwise).
4. Every release gets its **own unique Compose snapshot file** (`compose.<release>.json` or similar)
   so the exact service definition of each release, and of its rollback target, is preserved.
5. Never run seeds, fixtures, `migrate reset` or `down -v` against production.
6. Use placeholders in all records: `<release>` (short release name), `<sha>` (40-character commit),
   `<project>` (Compose project), `<release-dir>`. Never write secrets, passwords, student data or QR
   credentials in release notes.

## Release scripts

Production releases use two operator-held scripts per release: a **prep script** and a **release
wrapper**. They are prepared per release from the procedure below and are **not stored in this
repository**, so their exact content is **not verified** here. The repository holds the building
blocks they call: `deploy/ops/backup/capture.sh` (capture), `deploy/scripts/verify-restore.mjs`
(restore comparison), `deploy/scripts/launch.mjs` (runtime secrets loader),
`deploy/scripts/check-config.py`, `deploy/scripts/smoke.mjs` and the Dockerfile targets.

### Step 1 — artifact (CI)

The release PR's CI builds the `api`, `worker`, `web` and `tools` targets for linux/amd64 and keeps
`docversity-linux-amd64-<sha>` (for seven days) with `images.tar.gz`, `images.json`, `rehearsal.json`
and `SHA256SUMS`. Download it privately and keep it with the run ID.

### Step 2 — prep script (no production change)

Run as the operator: `sudo <release-dir>/prep.sh` (name illustrative). It must:

1. **Stage and verify the artifact:** `sha256sum --check SHA256SUMS`; compare `images.json` `commit`
   with `<sha>`.
2. **Load images:** `docker load --input images.tar.gz`; compare every loaded image `.Id` exactly with
   `images.json`; tag the verified IDs for the production project.
3. **Capture a backup** of the live database and objects (`capture.sh` pattern: readiness check,
   `pg_dump -Fc`, per-table count/hash fingerprints, private object mirror, SHA-256 manifest).
4. **Isolated restore test:** restore that database dump and the MinIO objects into a separate,
   throwaway project/volumes; compare table fingerprints and object bytes. Never touch the live
   volumes.
5. **Migration rehearsal** on the restored copy with the new image: apply the new migrations, then
   run the drift check. Stop if any migration fails or the drift check reports differences.
6. **Precheck:** configuration validation, disk/memory headroom, containers healthy, expected
   current release recorded.

Stop on any failure. Nothing in production has changed at this point.

### Step 3 — release wrapper (production change, in the approved window)

Run as the operator: `sudo <release-dir>/release.sh` (name illustrative). Sequence:

1. **Baseline gate:** current SHA/images, health of all services and public endpoints recorded; the
   run refuses if the baseline is not the expected previous release.
2. **Capture** a fresh pre-release backup (same as prep step 3).
3. **Precheck** again.
4. **Migrate:** apply the reviewed migrations once with the owner database connection.
5. **Switch `api` and `web`** to the new images using the release's own Compose snapshot. How the
   worker image is handled is decided per release in the wrapper (**not verified** here).
6. **Automatic image-only rollback:** if health or smoke checks fail after the switch, the wrapper
   puts the previous `api` and `web` images back (schema kept) and stops.
7. **Verify:** health, smoke checks (`smoke.mjs` style: HTTPS, staff/student auth separation,
   storage round-trip), public pages respond.
8. **Post-state:** record new SHA, image IDs, migration count, table counts and backup ID in the
   private release record.

### Manual rollback (command shape)

Use only when the automatic rollback did not run or a problem appears later, and only if the
previous images are compatible with the current schema:

```sh
# On the VPS, as the operator. Placeholders only.
docker compose -p <project> -f <release-dir>/compose.<previous-release>.json \
  up -d --no-build --no-deps api web
docker compose -p <project> -f <release-dir>/compose.<previous-release>.json ps
```

Then run the verification checks above and record the outcome. Do not run any migration command
and do not restore a backup as part of an image rollback.

Release-specific cautions recorded in the repository:

- Rolling back to a release older than the staff-MFA release (`70b11d2` per the Hostinger runbook)
  drops second-factor checks and ignores the forced password change; follow the steps in
  [hostinger-operator-runbook.md](../development/hostinger-operator-runbook.md#staff-mfa--first-login-release-adr-0021-and-rollback-to-70b11d2).
- Never roll back to pre-15A authentication code.
- After admission-letter enum values or publication receipts exist, an application-only downgrade
  across `20261114090000_official_verification` is not claimed compatible.

## Merged, deploys with the next release

Two open PRs add migrations: #62 `20261201090000_examination_schedule` and #63
`20261202090000_migration_certificate_type` (production would go from 27 migrations to 28 or 29).
Both are additive. `ALTER TYPE ... ADD VALUE` (#63) cannot be removed, so after #63 a rollback is
image-only by necessity. Include both in the prep migration rehearsal when they are released.
