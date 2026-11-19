#!/bin/sh
# Daily job (docversity-backup.service): capture, then encrypt to the custody public key.
# Plaintext is pruned only later, by prune-backups.sh, after off-server verification.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
D=$(sh "$HERE/capture.sh" | tee /dev/stderr | tail -1)
"$HERE/encrypt-backup.sh" "$D"
