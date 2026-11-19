#!/bin/sh
# Encrypt one plaintext backup set on the VPS to the custody PUBLIC key, then verify the result.
# Usage: encrypt-backup.sh <backup dir>   (e.g. .../university/backups/20261118T122235Z)
# The VPS keyring holds only the public key; this script refuses to run if a secret key is present.
# Output: $DV_ENC_DIR/<ts>.tar.gpg and <ts>.tar.gpg.sha256. Never deletes plaintext (prune-backups.sh).
set -eu
umask 077
HERE=$(cd "$(dirname "$0")" && pwd)
GNUPG=${DV_GNUPGHOME:-/etc/docversity/backup-gnupg}
RECIPIENT=${DV_RECIPIENT:-E9E34ADEBC492B000736862C2936904343F7AF44}
ENC=${DV_ENC_DIR:-/opt/docversity/university-2efcea18-20261114/university/backups-encrypted}
die() { echo "encrypt-backup: $*" >&2; exit 1; }
sha256() { { sha256sum "$1" 2>/dev/null || shasum -a 256 "$1"; } | cut -d' ' -f1; }

[ $# -eq 1 ] || die "usage: encrypt-backup.sh <backup dir>"
D=${1%/}
TS=$(basename "$D")
case $TS in
  20[0-9][0-9][01][0-9][0-3][0-9]T[0-2][0-9][0-5][0-9][0-5][0-9]Z) ;;
  *) die "not a backup set name: $TS" ;;
esac
[ -d "$D" ] && [ -f "$D/manifest.json" ] || die "no manifest.json in $D"
python3 "$HERE/verify-manifest.py" "$D" || die "plaintext set fails its manifest; not encrypting"

gpg --homedir "$GNUPG" --batch --with-colons --list-secret-keys 2>/dev/null | grep -q '^sec' &&
  die "secret key present in $GNUPG; the VPS must hold the public key only"
EXPECTED=$(gpg --homedir "$GNUPG" --batch --with-colons --list-keys "$RECIPIENT" |
  awk -F: '$1=="sub" && $12 ~ /e/ {print $5}' | sort -u)
[ -n "$EXPECTED" ] || die "no encryption subkey for $RECIPIENT in $GNUPG"

mkdir -p "$ENC"
chmod 700 "$ENC"
OUT=$ENC/$TS.tar.gpg
[ ! -e "$OUT" ] || die "$OUT already exists"
trap 'rm -f "$OUT.tmp"' EXIT
# Plaintext never touches disk outside the original set: tar streams straight into gpg.
tar -C "$(dirname "$D")" -cf - "$TS" |
  gpg --homedir "$GNUPG" --batch --no-tty --trust-model always \
    --recipient "$RECIPIENT" --encrypt --output "$OUT.tmp"

# Verify: a non-empty OpenPGP message addressed to exactly the custody encryption subkey(s).
[ -s "$OUT.tmp" ] || die "empty ciphertext"
GOT=$(gpg --homedir "$GNUPG" --batch --no-tty --list-packets "$OUT.tmp" 2>/dev/null |
  sed -n 's/^:pubkey enc packet:.* keyid \([0-9A-F]*\).*/\1/p' | sort -u || true)
[ "$GOT" = "$EXPECTED" ] || die "ciphertext recipients ($GOT) differ from custody subkey ($EXPECTED)"

HASH=$(sha256 "$OUT.tmp")
mv "$OUT.tmp" "$OUT"
trap - EXIT
printf '%s  %s\n' "$HASH" "$TS.tar.gpg" >"$OUT.sha256"
echo "encrypted: $OUT sha256=$HASH bytes=$(wc -c <"$OUT" | tr -d ' ')"
