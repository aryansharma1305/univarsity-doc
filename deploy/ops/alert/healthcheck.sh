#!/bin/sh
# Docversity health check (docversity-healthcheck.timer, every 5 min). Read-only on the stack.
# Checks: public HTTPS, container health, TLS expiry, API 5xx / error-level / 429 counts, CSP report
# count, disk + inodes, backup age and backup job failure. Alerts on a new problem, repeats every
# DV_REPEAT_MINUTES, and sends RECOVERED when it clears. Messages carry counts only.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source-path=SCRIPTDIR source=alert.env.example
[ -r "${DV_ALERT_ENV:-/etc/docversity/alert.env}" ] && . "${DV_ALERT_ENV:-/etc/docversity/alert.env}"
URL=${DV_URL:-https://verify.thedocversity.com/}
HOST=$(echo "$URL" | sed 's|^https://||; s|/.*||')
P=${DV_PROJECT:-docversity-university-407e5ed2}
CONTAINERS=${DV_CONTAINERS:-"$P-api-1 $P-worker-1 $P-uniweb-407e5ed2-1 $P-public-proxy-1 $P-postgres-1 $P-redis-1 $P-minio-1"}
WINDOW=${DV_WINDOW:-10m}
ENC=${DV_ENC_DIR:-/opt/docversity/university-2efcea18-20261114/university/backups-encrypted}
STATE=${DV_STATE_DIR:-/var/lib/docversity-alert}
NOTIFY=${DV_NOTIFY:-$HERE/notify.sh}
mkdir -p "$STATE"

FAILS=""
fail() { FAILS="$FAILS$1|$2
"; }

code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$URL" 2>/dev/null || echo 000)
[ "$code" = 200 ] || fail uptime "GET $URL returned $code"

for c in $CONTAINERS; do
  s=$(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}healthy{{end}}' "$c" 2>/dev/null || echo missing)
  [ "$s" = "running healthy" ] || fail "container-$c" "$c is $s"
done

end=$(echo | openssl s_client -servername "$HOST" -connect "$HOST:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$end" ]; then
  days=$(( ($(date -d "$end" +%s) - $(date +%s)) / 86400 ))
  [ "$days" -ge "${DV_TLS_MIN_DAYS:-21}" ] || fail tls "certificate for $HOST expires in $days days"
else
  fail tls "could not read the TLS certificate of $HOST"
fi

counts=$(docker logs --since "$WINDOW" "$P-api-1" 2>&1 | python3 "$HERE/logcount.py")
n5=$(echo "$counts" | sed -n 's/.*5xx=\([0-9]*\).*/\1/p')
ne=$(echo "$counts" | sed -n 's/.*error=\([0-9]*\).*/\1/p')
n4=$(echo "$counts" | sed -n 's/.* 429=\([0-9]*\).*/\1/p')
[ "${n5:-0}" -le "${DV_API_5XX_MAX:-5}" ] || fail api-5xx "$n5 API 5xx responses in $WINDOW"
[ "${ne:-0}" -le "${DV_API_ERROR_MAX:-5}" ] || fail api-error "$ne API error-level log lines in $WINDOW"
# Shared-IP limit (PR #46): a spike usually means one campus NAT/IP is being throttled.
[ "${n4:-0}" -le "${DV_429_MAX:-30}" ] || fail rate-limit "$n4 HTTP 429 in $WINDOW ($counts)"

ncsp=$(docker logs --since "$WINDOW" "$P-uniweb-407e5ed2-1" 2>&1 | grep -c '"msg":"csp-violation"')
[ "$ncsp" -le "${DV_CSP_MAX:-50}" ] || fail csp "$ncsp CSP violation reports in $WINDOW"

disk=$(df -P / | awk 'NR==2 {sub("%","",$5); print $5}')
inode=$(df -Pi / | awk 'NR==2 {sub("%","",$5); print $5}')
[ "$disk" -le "${DV_DISK_MAX_PCT:-85}" ] || fail disk "root filesystem ${disk}% used"
[ "$inode" -le "${DV_DISK_MAX_PCT:-85}" ] || fail inodes "root filesystem inodes ${inode}% used"

newest=$(ls -1t "$ENC"/*.tar.gpg 2>/dev/null | head -1)
if [ -z "$newest" ]; then
  fail backup-age "no encrypted backup in $ENC"
else
  age=$(( ($(date +%s) - $(stat -c %Y "$newest")) / 3600 ))
  [ "$age" -le "${DV_BACKUP_MAX_AGE_HOURS:-26}" ] || fail backup-age "newest encrypted backup is ${age}h old"
fi
systemctl is-failed --quiet docversity-backup.service 2>/dev/null && fail backup-job "docversity-backup.service failed"

# Dedupe: alert on new problems, repeat after DV_REPEAT_MINUTES, announce recoveries.
now=$(date +%s)
printf '%s' "$FAILS" | while IFS='|' read -r key msg; do
  [ -n "$key" ] || continue
  f=$STATE/$key
  if [ ! -f "$f" ] || [ $((now - $(cat "$f"))) -ge $(( ${DV_REPEAT_MINUTES:-60} * 60 )) ]; then
    "$NOTIFY" "Docversity ALERT $key" "$msg" && echo "$now" >"$f"
  fi
done
for f in "$STATE"/*; do
  [ -f "$f" ] || continue
  key=$(basename "$f")
  printf '%s' "$FAILS" | grep -q "^$key|" && continue
  "$NOTIFY" "Docversity RECOVERED $key" "$key is OK again" && rm -f "$f"
done

if [ -n "${DV_HEARTBEAT_URL:-}" ]; then
  suffix=""
  [ -n "$FAILS" ] && suffix=/fail
  curl -fsS -m 10 -o /dev/null "$DV_HEARTBEAT_URL$suffix" || true
fi
if [ -n "$FAILS" ]; then
  printf '%s' "$FAILS" | cut -d'|' -f2
  exit 1
fi
echo "healthcheck: OK"
