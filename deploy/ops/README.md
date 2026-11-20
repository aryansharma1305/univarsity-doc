# deploy/ops — production hardening kit

Reviewable scripts and runbooks for the single production VPS (`189.72.149.93`, Compose project
`docversity-university-407e5ed2`). **Nothing in this directory has been applied to production.** Each
runbook lists gates, exact apply steps and rollback; every apply needs operator approval.

| Area                  | Files                                                                                       | Runbook                                                    |
| --------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| SSH hardening         | `ssh/00-docversity-hardening.conf`                                                          | [ssh/RUNBOOK.md](ssh/RUNBOOK.md)                           |
| Backups               | `backup/capture.sh`, `encrypt-backup.sh`, `prune-backups.sh`, `pull-verify.sh` (Mac), timer | [backup/RUNBOOK.md](backup/RUNBOOK.md)                     |
| Monitoring / alerting | `alert/healthcheck.sh`, `logcount.py`, `notify.sh`, timer, `alert.env.example`              | [alert/RUNBOOK.md](alert/RUNBOOK.md)                       |
| Key custody           | —                                                                                           | [custody/EMERGENCY-ACCESS.md](custody/EMERGENCY-ACCESS.md) |
| CSP (web app)         | `apps/web/src/lib/csp.ts`, `src/proxy.ts`, `next.config.ts`, `/csp-report`                  | [csp-rollout.md](csp-rollout.md)                           |

Install location on the VPS (when approved): `/opt/docversity/ops/` (a copy of this directory, root
0700), config in `/etc/docversity/` (0700 dir, 0600 files).

Design rules: POSIX `sh` + tools already on the VPS (`gpg`, `curl`, `python3`, `docker`, `openssl`);
no new packages. Scripts print counts and paths only, never secrets or personal data. Destructive
steps are dry runs unless `--apply`.

Checks (CI job `ops-scripts`, also locally):

```sh
shellcheck -x -S warning deploy/ops/*/*.sh
sh deploy/ops/test/selftest.sh   # throwaway GPG key + synthetic data; healthcheck part needs GNU date
```
