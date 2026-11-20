# Monitoring and alerting runbook

**Nothing here has been applied.** Today there is no alerting (KNOWN-ISSUES #4).

## State on 2026-11-19 (read-only evidence)

- Timers: only OS timers (sysstat, apt, logrotate, …); no health or uptime check; no MTA (`mail`,
  `sendmail`, `msmtp` absent); `curl`, `python3`, `openssl`, `gpg` present; `jq` absent.
- All 7 containers `healthy` (api restarted ~3 min before the check: recent deploy).
- API log (24 h): 431 JSON lines `{level,status,path,msg,…}`; 87 2xx, 7 4xx, 0 5xx, 0 429, 0 error level.
- Caddy logs no access lines (no `log` directive), so HTTP status counts come from the API log.
- Disk 48% used, inodes 11%; TLS valid to 2027-02-08.

## Design

`healthcheck.sh` every 5 minutes (systemd timer), read-only against the stack:

| Check           | Source                                       | Default threshold     |
| --------------- | -------------------------------------------- | --------------------- |
| Uptime          | `curl https://verify.thedocversity.com/`     | not 200               |
| Containers      | `docker inspect` of the 7 services           | not `running healthy` |
| TLS expiry      | `openssl s_client`                           | < 21 days             |
| API 5xx         | API log, last 10 min (`logcount.py`)         | > 5                   |
| API error-level | same                                         | > 5                   |
| 429 spike       | same (shared-IP limit from PR #46), top path | > 30                  |
| CSP reports     | web log `"msg":"csp-violation"`              | > 50                  |
| Disk / inodes   | `df /`                                       | > 85%                 |
| Backup age      | newest `backups-encrypted/*.tar.gpg`         | > 26 h                |
| Backup job      | `systemctl is-failed docversity-backup`      | failed                |

The timer runs on the wall clock (`*:0/5`); a run with findings exits 1, so the unit shows as failed
until the next clean run. Alerts fire on a new problem, repeat hourly while it lasts, and a RECOVERED message follows. Messages
hold counts only. `DV_HEARTBEAT_URL` (e.g. healthchecks.io) is pinged every run (`/fail` on problems):
that external dead-man's switch is the only thing that notices a dead VPS or a stopped timer.

Note: until the backup timer runs and the existing plaintext sets are handled, `backup-age` and
`plaintext-age` alert (intended: both are overdue). Notifier URLs/tokens and the heartbeat URL reach
curl through a config on stdin, never the command line.

## Notification channel — OPEN DECISION (D2)

`notify.sh` supports `log` (default), `webhook`, `ntfy`, `telegram`, `email` (needs an MTA: new
package). Recommendation: `telegram` or `ntfy` to the operator **and** the second custodian, plus a
free healthchecks.io heartbeat that emails both. Who receives alerts out of hours is part of D2.

## Gates

- [ ] G1 Operator approves the VPS write (shared with the backup kit: `/opt/docversity/ops`).
- [ ] G2 D2 decided; `/etc/docversity/alert.env` filled (0600); a test message received.
- [ ] G3 One manual run prints `healthcheck: OK` (or only expected findings, e.g. backup age).

## Apply

```sh
install -m 600 /opt/docversity/ops/alert/alert.env.example /etc/docversity/alert.env   # then edit
/opt/docversity/ops/alert/notify.sh "Docversity test" "alert channel works"
/opt/docversity/ops/alert/healthcheck.sh; echo "exit=$?"
cp /opt/docversity/ops/alert/docversity-healthcheck.{service,timer} /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now docversity-healthcheck.timer
journalctl -u docversity-healthcheck -n 20 --no-pager
```

## Rollback

```sh
systemctl disable --now docversity-healthcheck.timer
rm -f /etc/systemd/system/docversity-healthcheck.{service,timer} && systemctl daemon-reload
rm -rf /var/lib/docversity-alert
```
