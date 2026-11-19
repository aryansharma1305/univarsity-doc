#!/bin/sh
# Operator Mac: pull new encrypted sets from the VPS, verify them by decrypting with the custody key,
# sign the checksums, and only then tell the VPS the set is safe off-server (<ts>.offsite-verified).
# Usage: pull-verify.sh [<ts> ...]   (default: every VPS set without an .offsite-verified marker)
# Run in Terminal (the custody key passphrase is asked by pinentry; set DV_PASSPHRASE_FILE to use
# the custody passphrase file instead). Prints no plaintext.
set -eu
umask 077
HERE=$(cd "$(dirname "$0")" && pwd)
VPS=${DV_VPS:-root@189.72.149.93}
ENC=${DV_ENC_DIR:-/opt/docversity/university-2efcea18-20261114/university/backups-encrypted}
LOCAL=${DV_LOCAL_DIR:-$HOME/.docversity-recovery-vps}
GNUPG=${DV_CUSTODY_GNUPGHOME:-$HOME/.docversity-recovery-keys/gnupg-20261114}
die() { echo "pull-verify: $*" >&2; exit 1; }
sha256() { { sha256sum "$1" 2>/dev/null || shasum -a 256 "$1"; } | cut -d' ' -f1; }
PASS=""
[ -n "${DV_PASSPHRASE_FILE:-}" ] && PASS="--pinentry-mode loopback --passphrase-file $DV_PASSPHRASE_FILE"

if [ $# -eq 0 ]; then
  # Set names are fixed-format timestamps; splitting the list into arguments is intended.
  # shellcheck disable=SC2016,SC2046
  set -- $(ssh "$VPS" "cd '$ENC' && for f in 20*Z.tar.gpg; do t=\${f%.tar.gpg}; [ -e \"\$t.offsite-verified\" ] || echo \"\$t\"; done")
fi
[ $# -gt 0 ] || { echo "nothing to verify"; exit 0; }
mkdir -p "$LOCAL"

for TS in "$@"; do
  case $TS in 20*Z) ;; *) die "bad set name $TS" ;; esac
  dest=$LOCAL/$TS
  mkdir -p "$dest"
  scp -q "$VPS:$ENC/$TS.tar.gpg" "$VPS:$ENC/$TS.tar.gpg.sha256" "$dest/"
  (cd "$dest" && { sha256sum -c "$TS.tar.gpg.sha256" 2>/dev/null || shasum -a 256 -c "$TS.tar.gpg.sha256"; }) >/dev/null ||
    die "$TS: transferred ciphertext does not match the VPS checksum"
  tmp=$(mktemp -d)
  # shellcheck disable=SC2086
  if ! gpg --homedir "$GNUPG" --batch --quiet $PASS --decrypt "$dest/$TS.tar.gpg" | tar -C "$tmp" -xf -; then
    rm -rf "$tmp"
    die "$TS: decryption failed"
  fi
  if ! python3 "$HERE/verify-manifest.py" "$tmp/$TS"; then
    rm -rf "$tmp"
    die "$TS: decrypted set fails its manifest"
  fi
  rm -rf "$tmp"
  hash=$(sha256 "$dest/$TS.tar.gpg")
  (cd "$dest" && printf '%s  %s\n' "$hash" "$TS.tar.gpg" >SHA256SUMS)
  # shellcheck disable=SC2086
  gpg --homedir "$GNUPG" --batch --yes $PASS --detach-sign --output "$dest/SHA256SUMS.sig" "$dest/SHA256SUMS"
  printf '%s verified-by=%s at=%s\n' "$hash" "$(whoami)@$(hostname -s)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" |
    ssh "$VPS" "umask 077; cat > '$ENC/$TS.offsite-verified.tmp' && mv '$ENC/$TS.offsite-verified.tmp' '$ENC/$TS.offsite-verified'"
  echo "verified off-server: $TS sha256=$hash"
done
