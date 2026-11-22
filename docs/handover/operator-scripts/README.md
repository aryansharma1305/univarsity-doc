# Operator scripts (VPS, run by the operator with `sudo`)

These are the exact scripts used for the production VPS at release `916b07c`. They hold production
paths and image IDs, never secrets. The only passwords are throwaway credentials for isolated,
network-less rehearsal containers. Copy a script to `/tmp` on the VPS, compare its SHA-256 with the
reviewed copy, and run it with output saved, for example:

```bash
ssh -t -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes dvops@<vps> 'sudo bash /tmp/<script>.sh' 2>&1 | tee ~/<script>.txt
```

| Script                          | Changes production?                    | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dv-flag-check.sh`              | No (read-only)                         | Effective `OFFICIAL_VERIFICATION_ENABLED` of the running API. It compares the deployed `secrets/runtime`, the copy mounted in the api container, and the environment of the single child process of `launch.mjs` (PID 1). It prints `EFFECTIVE …: on/off` only when all three agree, and `UNKNOWN` otherwise. It prints no other runtime value. It also lists, per service and course, the latest approved policy and whether it allows anonymous display. |
| `dv-disclosure-inventory.sh`    | No (read-only)                         | Courses, current policy per service, open drafts, roll-number readiness, issued documents, published results, Super Admins who can propose or approve. Codes, counts and staff display names only.                                                                                                                                                                                                                                                         |
| `example-dv-prep-916b07c.sh`    | No containers switched, no migrations  | Release preparation as run for `916b07c`. It verifies and loads the artifact, takes a fresh backup, restores the database and MinIO in isolation, checks the schema, and runs the deploy precheck. A new release changes the pinned commit, zip digest, image IDs, rollback targets, `EXPECT_BEFORE` / `MIGRATIONS_ADDED` and the snapshot name. With migrations it adds a rehearsal on the restored copy (see the `21d9146` procedure in the runbook).    |
| `example-dv-release-916b07c.sh` | **Yes** (after explicit approval only) | Baseline gate, fresh backup, precheck, migrate, api + web switch with automatic image-only rollback, verify, post-state.                                                                                                                                                                                                                                                                                                                                   |

The wrappers also need `vps-deploy-portal.sh`, `vps-capture.sh` and `vps-restore-test.sh`, installed
from `/opt/docversity/release-0071bdb/` on the VPS. They are not in this repository.
