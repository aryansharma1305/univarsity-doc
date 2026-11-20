#!/bin/sh
# Read-only capture of the live university DB + objects into a private backup dir on the VPS.
# Prints only non-sensitive status lines; the last line is the backup directory.
# Copy of the rehearsed release-55c2350-mfa/vps-capture.sh; only change: the metadata scope text
# comes from $SCOPE (default: scheduled daily capture) instead of being edited per occasion, and a
# failed run removes its partial set.
set -eu
umask 077
B=/opt/docversity/university-2efcea18-20261114
P=docversity-university-407e5ed2
C="docker compose -p $P -f $B/university/compose.json"
PG=docversity-university-407e5ed2-postgres-1
TS=$(date -u +%Y%m%dT%H%M%SZ)
D=$B/university/backups/$TS
mkdir -m 700 "$D" "$D/objects"
# A failed capture leaves no partial set behind (removed again just before success below).
# dash runs no EXIT trap on a signal, so INT/TERM clean up and exit themselves.
trap 'rm -rf "$D"' EXIT
trap 'rm -rf "$D"; exit 130' INT
trap 'rm -rf "$D"; exit 143' TERM
sql() { docker exec "$PG" psql -U docversity_owner -d docversity_university -Atc "$1"; }

$C --profile operator run --rm --no-deps backup-readiness >"$D/.readiness.log" 2>&1
grep -q 'Backup readiness passed' "$D/.readiness.log" && echo "readiness: passed"
rm -f "$D/.readiness.log"

docker exec "$PG" pg_dump -Fc -U docversity_owner -d docversity_university >"$D/database.dump"
echo "dump bytes: $(stat -c %s "$D/database.dump")"

# Same per-table count|content-hash format as the 20261114 baseline.
{
  echo '{'
  first=1
  for t in $(sql "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1"); do
    v=$(sql "SELECT count(*)||'|'||coalesce(md5(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text))),'') FROM public.\"$t\" t")
    [ $first = 1 ] || echo ','
    first=0
    printf '  "%s": "%s"' "$t" "$v"
  done
  echo
  echo '}'
} >"$D/tables.json"

$C --profile operator run --rm --no-deps storage-tools mirror --quiet local/docversity-university "/backups/$TS/objects" >/dev/null 2>&1
echo "objects: $(find "$D/objects" -type f | wc -l)"

cp "$B/university/compose.json" "$B/university/instance.json" "$B/classic-identity/images-classic.json" "$D/"
cp -r "$B/university/secrets" "$D/secrets"

STU=$(sql 'select count(*) from students'); REG=$(sql 'select count(*) from student_registrations')
USR=$(sql 'select count(*) from users'); MIG=$(sql 'select count(*) from _prisma_migrations where finished_at is not null')
TBL=$(sql "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")
cat >"$D/metadata.json" <<EOF
{
  "sourceSHA": "$(git -C "$B/control" rev-parse HEAD)",
  "capturedUTC": "$TS",
  "database": "docversity_university",
  "students": $STU,
  "registrations": $REG,
  "users": $USR,
  "migrations": $MIG,
  "tableCount": $TBL,
  "scope": "${SCOPE:-Scheduled daily capture; includes STAFF_MFA_ENCRYPTION_KEY escrow in secrets/runtime}"
}
EOF
echo "counts: students=$STU registrations=$REG users=$USR migrations=$MIG tables=$TBL"

(cd "$D" && find . -type f ! -name manifest.json | sort | sed 's|^\./||' | while read -r f; do
  printf '%s\t%s\n' "$f" "$(sha256sum "$f" | cut -d' ' -f1)"; done) |
  python3 -c 'import sys,json;print(json.dumps(dict(l.rstrip("\n").split("\t") for l in sys.stdin),indent=2))' >"$D/manifest.json"
chmod -R go-rwx "$D"
echo "manifest entries: $(python3 -c "import json;print(len(json.load(open('$D/manifest.json'))))")"
trap - EXIT INT TERM
echo "$D"
