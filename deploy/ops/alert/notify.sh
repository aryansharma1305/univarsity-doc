#!/bin/sh
# Send one alert. Usage: notify.sh <subject> <body>
# Channel from /etc/docversity/alert.env (ALERT_CHANNEL); always also logged to the journal.
#   log       journal only (default until the channel decision is made)
#   webhook   JSON {"subject","text"} POST to ALERT_WEBHOOK_URL (Slack/Discord/Teams-compatible relays)
#   ntfy      POST to ALERT_NTFY_URL (ntfy.sh topic or self-hosted)
#   telegram  ALERT_TELEGRAM_TOKEN + ALERT_TELEGRAM_CHAT_ID
#   email     ALERT_EMAIL_TO via a local sendmail (needs an MTA such as msmtp: not installed today)
set -eu
# shellcheck source-path=SCRIPTDIR source=alert.env.example
[ -r "${DV_ALERT_ENV:-/etc/docversity/alert.env}" ] && . "${DV_ALERT_ENV:-/etc/docversity/alert.env}"
SUBJECT=$1
BODY=$2
logger -t docversity-alert -- "$SUBJECT: $BODY" 2>/dev/null || echo "docversity-alert: $SUBJECT: $BODY" >&2
# URLs and tokens reach curl through a config on stdin, never argv (visible in ps / audit logs).
# Usage: post <url> [curl options]
post() {
  case $1 in *'"'* | *'\'*) echo "notify: unsupported characters in URL" >&2; return 2 ;; esac
  url=$1
  shift
  printf 'url = "%s"\n' "$url" | curl -fsS -m 15 -o /dev/null -K - "$@"
}
body=$(mktemp)
trap 'rm -f "$body"' EXIT
case ${ALERT_CHANNEL:-log} in
  log) ;;
  webhook)
    python3 -c 'import json,sys;print(json.dumps({"subject":sys.argv[1],"text":sys.argv[1]+"\n"+sys.argv[2]}))' \
      "$SUBJECT" "$BODY" >"$body"
    post "$ALERT_WEBHOOK_URL" --data-binary "@$body" -H 'Content-Type: application/json' ;;
  ntfy)
    printf '%s' "$BODY" >"$body"
    post "$ALERT_NTFY_URL" --data-binary "@$body" -H "Title: $SUBJECT" ;;
  telegram)
    printf '%s\n%s' "$SUBJECT" "$BODY" >"$body"
    post "https://api.telegram.org/bot$ALERT_TELEGRAM_TOKEN/sendMessage" \
      --data-urlencode "chat_id=$ALERT_TELEGRAM_CHAT_ID" --data-urlencode "text@$body" ;;
  email)
    printf 'To: %s\nSubject: %s\n\n%s\n' "$ALERT_EMAIL_TO" "$SUBJECT" "$BODY" | sendmail -t ;;
  *) echo "notify: unknown ALERT_CHANNEL" >&2; exit 2 ;;
esac
