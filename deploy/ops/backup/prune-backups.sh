#!/bin/sh
# Prune backups on the VPS. DRY RUN unless --apply is given.
#  1. Plaintext set <ts>/ is removed only when <ts>.tar.gpg exists, its sha256 matches
#     <ts>.tar.gpg.sha256 AND <ts>.offsite-verified (written by pull-verify.sh after an off-server
#     decrypt + manifest check) names that same sha256.
#  2. Encrypted sets: the newest $DV_KEEP_ENCRYPTED (default 14) are kept; older ones are removed only
#     if they were verified off-server.
# Never touches /opt/docversity/app/.local/backups (staging-era set; separate approval).
set -eu
PLAIN=${DV_PLAIN_DIR:-/opt/docversity/university-2efcea18-20261114/university/backups}
ENC=${DV_ENC_DIR:-/opt/docversity/university-2efcea18-20261114/university/backups-encrypted}
KEEP=${DV_KEEP_ENCRYPTED:-14}
APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1
sha256() { { sha256sum "$1" 2>/dev/null || shasum -a 256 "$1"; } | cut -d' ' -f1; }

# Prints the verified hash for <ts>, or nothing.
verified() {
  f=$ENC/$1.tar.gpg
  [ -f "$f" ] && [ -f "$f.sha256" ] && [ -f "$ENC/$1.offsite-verified" ] || return 0
  want=$(cut -d' ' -f1 "$f.sha256")
  [ "$(cut -d' ' -f1 "$ENC/$1.offsite-verified")" = "$want" ] || return 0
  [ "$(sha256 "$f")" = "$want" ] && echo "$want"
  return 0
}

act() {
  if [ $APPLY = 1 ]; then rm -rf -- "$@"; echo "removed: $*"; else echo "would remove: $*"; fi
}

for d in "$PLAIN"/20*Z; do
  [ -d "$d" ] || continue
  ts=$(basename "$d")
  if [ -n "$(verified "$ts")" ]; then act "$d"; else echo "keep plaintext (not verified off-server): $ts"; fi
done

n=0
# Set names are fixed-format timestamps (no spaces), so word splitting is safe here.
# shellcheck disable=SC2010
for f in $(ls -1 "$ENC" 2>/dev/null | grep '\.tar\.gpg$' | sort -r); do
  n=$((n + 1))
  ts=${f%.tar.gpg}
  [ $n -le "$KEEP" ] && continue
  if [ -n "$(verified "$ts")" ]; then
    act "$ENC/$f" "$ENC/$f.sha256" "$ENC/$ts.offsite-verified"
  else
    echo "keep encrypted (beyond $KEEP but not verified off-server): $ts"
  fi
done
[ $APPLY = 1 ] || echo "dry run: nothing removed (use --apply)"
