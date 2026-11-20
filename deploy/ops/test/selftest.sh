#!/bin/sh
# Offline self-test for deploy/ops scripts: throwaway GPG key, synthetic backup sets, stubbed docker.
# Touches nothing outside a temp dir. Run: sh deploy/ops/test/selftest.sh
set -eu
OPS=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d)
# shellcheck disable=SC2154
trap 'for h in priv other pub wrongpub; do gpgconf --homedir "$T/$h" --kill all 2>/dev/null || true; done; rm -rf "$T"' EXIT
ok() { echo "ok - $1"; }
no() { echo "FAIL - $1" >&2; exit 1; }
sha256() { { sha256sum "$1" 2>/dev/null || shasum -a 256 "$1"; } | cut -d' ' -f1; }

# --- logcount.py
out=$(printf '%s\n' \
  '{"level":"log","status":200,"path":"/api/v1/x"}' \
  '{"level":"error","status":500,"path":"/api/v1/y"}' \
  '{"level":"warn","status":429,"path":"/api/v1/auth/login?x=1"}' \
  '{"level":"warn","status":429,"path":"/api/v1/auth/login"}' \
  'not json' '{"level":"fatal"}' | python3 "$OPS/alert/logcount.py")
[ "$out" = "5xx=1 error=2 429=2 top429=/api/v1/auth/login" ] || no "logcount: $out"
ok "logcount counts 5xx, error levels and 429 by path"

# --- throwaway custody key: private keyring (stands in for the Mac) and public-only (the VPS)
mkdir -m 700 "$T/priv" "$T/pub"
gpg --homedir "$T/priv" --batch --quiet --no-tty --passphrase '' --quick-gen-key 'selftest <selftest@invalid>' ed25519 cert,sign never
FPR=$(gpg --homedir "$T/priv" --batch --with-colons --list-keys | awk -F: '$1=="fpr" {print $10; exit}')
gpg --homedir "$T/priv" --batch --quiet --no-tty --passphrase '' --quick-add-key "$FPR" cv25519 encr never
gpg --homedir "$T/priv" --batch --export "$FPR" | gpg --homedir "$T/pub" --batch --quiet --import

# --- synthetic backup set with manifest
P=$T/backups; E=$T/enc; TS=20260101T010203Z; D=$P/$TS
mkdir -p "$D/objects/a" "$D/secrets"
echo synthetic-dump >"$D/database.dump"; echo obj >"$D/objects/a/1"; echo SECRET=x >"$D/secrets/runtime"
(cd "$D" && find . -type f ! -name manifest.json | sed 's|^\./||' | while read -r f; do printf '%s\t%s\n' "$f" "$(sha256 "$f")"; done) |
  python3 -c 'import sys,json;print(json.dumps(dict(l.rstrip("\n").split("\t") for l in sys.stdin)))' >"$D/manifest.json"
python3 "$OPS/backup/verify-manifest.py" "$D" >/dev/null || no "verify-manifest on intact set"
ok "verify-manifest accepts an intact set"

export DV_SELFTEST=1 DV_SELFTEST_RECIPIENT="$FPR" DV_ENC_DIR="$E" DV_PLAIN_DIR="$P"
# Wrong recipient: a public keyring holding a different key must be refused.
mkdir -m 700 "$T/other"
mkdir -m 700 "$T/wrongpub"
gpg --homedir "$T/other" --batch --quiet --no-tty --passphrase '' --quick-gen-key 'other <other@invalid>' default default never
gpg --homedir "$T/other" --batch --export | gpg --homedir "$T/wrongpub" --batch --quiet --import
if DV_GNUPGHOME="$T/wrongpub" "$OPS/backup/encrypt-backup.sh" "$D" 2>/dev/null; then no "encrypt to a keyring without the custody key"; fi
if DV_SELFTEST=0 DV_GNUPGHOME="$T/pub" "$OPS/backup/encrypt-backup.sh" "$D" 2>/dev/null; then no "recipient override outside the self-test"; fi
ok "encrypt refuses a keyring without the pinned custody fingerprint and ignores overrides"
if DV_GNUPGHOME="$T/priv" "$OPS/backup/encrypt-backup.sh" "$D" 2>/dev/null; then no "encrypt with a secret key present"; fi
ok "encrypt refuses a keyring that holds a secret key"
DV_GNUPGHOME="$T/pub" "$OPS/backup/encrypt-backup.sh" "$D" >/dev/null || no "encrypt"
[ -s "$E/$TS.tar.gpg" ] && [ -f "$E/$TS.tar.gpg.sha256" ] || no "ciphertext + checksum written"
if grep -q synthetic-dump "$E/$TS.tar.gpg"; then no "plaintext visible in ciphertext"; fi
if DV_GNUPGHOME="$T/pub" "$OPS/backup/encrypt-backup.sh" "$D" 2>/dev/null; then no "overwrite"; fi
ok "encrypt writes a public-key-only ciphertext and never overwrites"

mkdir "$T/out"
gpg --homedir "$T/priv" --batch --quiet --decrypt "$E/$TS.tar.gpg" | tar -C "$T/out" -xf -
python3 "$OPS/backup/verify-manifest.py" "$T/out/$TS" >/dev/null || no "decrypted set verifies"
echo tampered >>"$T/out/$TS/database.dump"
if python3 "$OPS/backup/verify-manifest.py" "$T/out/$TS" >/dev/null; then no "tamper detected"; fi
ok "decrypted set matches its manifest; tampering is detected"

"$OPS/backup/prune-backups.sh" --apply >/dev/null
[ -d "$D" ] || no "plaintext kept without off-server marker"

# --- pull-verify.sh with ssh/scp stubbed to the local "VPS" directory
mkdir -p "$T/pvbin"
cat >"$T/pvbin/ssh" <<'STUB'
#!/bin/sh
shift
exec sh -c "$1"
STUB
cat >"$T/pvbin/scp" <<'STUB'
#!/bin/sh
[ "$1" = -q ] && shift
n=$#; i=1; srcs=""
for a in "$@"; do [ $i -lt $n ] && srcs="$srcs ${a#*:}"; dest=$a; i=$((i + 1)); done
# shellcheck disable=SC2086
cp $srcs "$dest"
STUB
chmod +x "$T/pvbin/"*
pv() { PATH="$T/pvbin:$PATH" DV_VPS=stub DV_LOCAL_DIR="$T/mac" DV_CUSTODY_GNUPGHOME="$T/priv" "$OPS/backup/pull-verify.sh" "$@"; }
if pv "../$TS" >/dev/null 2>&1; then no "pull-verify accepts a bad set name"; fi
pv >"$T/pv.log" 2>&1 || no "pull-verify run: $(tail -5 "$T/pv.log")"
[ -f "$E/$TS.offsite-verified" ] || no "marker written"
[ "$(cut -d' ' -f1 "$E/$TS.offsite-verified")" = "$(cut -d' ' -f1 "$E/$TS.tar.gpg.sha256")" ] || no "marker hash"
gpg --homedir "$T/priv" --batch --quiet --verify "$T/mac/$TS/SHA256SUMS.sig" "$T/mac/$TS/SHA256SUMS" 2>/dev/null || no "signature"
[ -z "$(find "${TMPDIR:-/tmp}" -maxdepth 2 -name "$TS" -path '*tmp.*' 2>/dev/null)" ] || no "decrypted temp dir left behind"
ok "pull-verify decrypts, checks the manifest, signs and writes the marker; rejects bad names"
rm "$E/$TS.offsite-verified"
echo "0000 wrong" >"$E/$TS.offsite-verified"
"$OPS/backup/prune-backups.sh" --apply >/dev/null
[ -d "$D" ] || no "plaintext kept with a mismatched marker"
echo "$(cut -d' ' -f1 "$E/$TS.tar.gpg.sha256") verified-by=selftest" >"$E/$TS.offsite-verified"
"$OPS/backup/prune-backups.sh" | grep -q "would remove: $D" || no "dry run"
[ -d "$D" ] || no "dry run removed"
"$OPS/backup/prune-backups.sh" --apply >/dev/null
[ ! -d "$D" ] || no "verified plaintext removed"
[ -f "$E/$TS.tar.gpg" ] || no "encrypted copy kept"
ok "prune removes plaintext only after a matching off-server marker, dry run by default"

# --- sshd: the drop-in must win over a cloud-init file that enables passwords
SSHD=$(command -v sshd || echo /usr/sbin/sshd)
if [ -x "$SSHD" ]; then
  mkdir -p "$T/sshd/sshd_config.d"
  ssh-keygen -q -t ed25519 -N '' -f "$T/sshd/hk"
  cp "$OPS/ssh/00-docversity-hardening.conf" "$T/sshd/sshd_config.d/"
  printf 'PasswordAuthentication yes\n' >"$T/sshd/sshd_config.d/50-cloud-init.conf"
  printf 'PasswordAuthentication no\n' >"$T/sshd/sshd_config.d/60-cloudimg-settings.conf"
  printf 'Include %s/sshd_config.d/*.conf\nHostKey %s/hk\nPermitRootLogin yes\nX11Forwarding yes\n' "$T/sshd" "$T/sshd" >"$T/sshd/sshd_config"
  eff=$("$SSHD" -T -f "$T/sshd/sshd_config" -C user=root,host=x,addr=192.0.2.1 2>/dev/null |
    grep -Ei '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin|authenticationmethods|maxauthtries|x11forwarding|allowagentforwarding) ' |
    sed 's/without-password/prohibit-password/' | sort | tr '\n' ' ')
  want="allowagentforwarding no authenticationmethods publickey kbdinteractiveauthentication no maxauthtries 6 passwordauthentication no permitrootlogin prohibit-password x11forwarding no "
  [ "$eff" = "$want" ] || no "sshd effective config: $eff"
  ok "sshd -T: drop-in wins over 50-cloud-init.conf PasswordAuthentication yes"
elif [ "${SELFTEST_REQUIRE_SSHD:-}" = 1 ]; then
  no "sshd not installed"
else
  echo "skip - sshd not installed"
fi

# --- healthcheck with stubbed commands (GNU date needed for the TLS check: Linux/CI only)
if date -d now >/dev/null 2>&1; then
  mkdir "$T/bin" "$T/state"
  cat >"$T/bin/docker" <<'STUB'
#!/bin/sh
case $1 in
  inspect) echo "running healthy" ;;
  logs) [ -f "$SELFTEST_LOGS" ] && cat "$SELFTEST_LOGS" ;;
esac
STUB
  printf '#!/bin/sh\necho 200\n' >"$T/bin/curl"
  printf '#!/bin/sh\ncase $1 in x509) echo "notAfter=$(date -d +90days)";; esac\n' >"$T/bin/openssl"
  printf '#!/bin/sh\nexit 1\n' >"$T/bin/systemctl"
  printf '#!/bin/sh\necho "$1" >>"%s/sent"\n' "$T" >"$T/notify"
  chmod +x "$T/bin/"* "$T/notify"
  run() { PATH="$T/bin:$PATH" DV_ALERT_ENV=/nonexistent DV_DISK_MAX_PCT=100 DV_PLAIN_DIR="$T/none" DV_STATE_DIR="$T/state" DV_NOTIFY="$T/notify" \
    DV_ENC_DIR="$E" SELFTEST_LOGS="$T/logs" "$OPS/alert/healthcheck.sh" >/dev/null 2>&1 || true; }
  : >"$T/logs"
  run
  [ ! -f "$T/sent" ] || no "healthy run sends nothing: $(cat "$T/sent")"
  i=0; while [ $i -lt 40 ]; do echo '{"level":"warn","status":429,"path":"/api/v1/auth/login"}'; i=$((i + 1)); done >"$T/logs"
  run; run
  [ "$(grep -c 'ALERT rate-limit' "$T/sent")" = 1 ] || no "429 spike alerts once: $(cat "$T/sent")"
  : >"$T/logs"
  run
  grep -q 'RECOVERED rate-limit' "$T/sent" || no "recovery announced"
  ok "healthcheck alerts once on a 429 spike and announces recovery"
  mkdir -p "$T/oldplain/20250101T000000Z"
  touch -d '-10 days' "$T/oldplain/20250101T000000Z"
  PATH="$T/bin:$PATH" DV_ALERT_ENV=/nonexistent DV_DISK_MAX_PCT=100 DV_PLAIN_DIR="$T/oldplain" DV_STATE_DIR="$T/state" \
    DV_NOTIFY="$T/notify" DV_ENC_DIR="$E" SELFTEST_LOGS="$T/logs" "$OPS/alert/healthcheck.sh" >/dev/null 2>&1 || true
  grep -q 'ALERT plaintext-age' "$T/sent" || no "plaintext-age alert"
  ok "healthcheck alerts on plaintext older than the off-server verification window"
else
  echo "skip - healthcheck (needs GNU date; runs in CI)"
fi
echo "selftest: all passed"
