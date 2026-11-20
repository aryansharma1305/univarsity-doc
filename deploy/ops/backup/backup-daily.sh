#!/bin/bash
# Daily job (docversity-backup.service): capture, then encrypt to the custody public key.
# Plaintext is pruned only later, by prune-backups.sh, after off-server verification.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
log=$(mktemp)
trap 'rm -f "$log"' EXIT
# Status lines go to the journal via stdout; capture.sh removes its own partial set on failure.
sh "$HERE/capture.sh" >"$log"
cat "$log"
"$HERE/encrypt-backup.sh" "$(tail -1 "$log")"
