#!/bin/bash
# READ-ONLY: effective OFFICIAL_VERIFICATION_ENABLED of the running production API, plus what turning it
# on would expose. Prints only that one key's value, counts and codes — never other runtime values.
# Run: sudo bash /tmp/dv-flag-check.sh
#
# Where the value comes from: the api container's PID 1 is deploy/scripts/launch.mjs, which reads
# /run/secrets/runtime (mounted from <deploy>/secrets/runtime) into the environment of the ONE child it
# spawns (the API). The container's Config.Env does not contain it. We read three sources and only
# report a value when they agree; anything missing, ambiguous or conflicting is UNKNOWN (fail closed).
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run with sudo"; exit 1; }
P=docversity-university-407e5ed2
U=/opt/docversity/university-2efcea18-20261114/university
KEY=OFFICIAL_VERIFICATION_ENABLED
svc() { docker ps -q --filter "label=com.docker.compose.project=$P" --filter "label=com.docker.compose.service=$1"; }
API=$(svc api); PG=$(svc postgres)
[ "$(echo "$API" | grep -c .)" = 1 ] && [ -n "$PG" ] || { echo "ABORT: expected exactly one api and one postgres container"; exit 1; }
h() { echo; echo "=== $*"; }
# Value of KEY in an env-style stream (NUL- or newline-separated); "absent" if missing, "multiple" if repeated.
pick() { tr '\0' '\n' | awk -F= -v k="$KEY" '$1==k{n++; v=substr($0,length(k)+2)} END{if(n==0)print "absent"; else if(n>1)print "multiple"; else print v}'; }
# What apps/api envBoolean accepts: true/1 -> on, false/0 or absent -> off (default false), else invalid.
meaning() { case "$1" in true|1) echo on;; false|0|absent) echo off;; *) echo invalid;; esac; }

h "F1 deployed runtime file (host)"
F=$(pick < "$U/secrets/runtime"); echo "$KEY in secrets/runtime: $F ($(meaning "$F"))"

h "F2 file mounted in the running api container"
M=$(docker exec "$API" cat /run/secrets/runtime | pick); echo "$KEY in /run/secrets/runtime: $M ($(meaning "$M"))"

h "F3 the API process itself (the single child of PID 1 = launch.mjs)"
cmd1=$(docker exec "$API" sh -c 'tr "\0" " " < /proc/1/cmdline'); echo "pid 1: $(echo "$cmd1" | awk '{print $1, $2}')"
kids=$(docker exec "$API" sh -c 'cat /proc/1/task/*/children 2>/dev/null' | tr -s ' ' '\n' | grep -c . || true)
if [ "$kids" = 1 ] && echo "$cmd1" | grep -q 'launch.mjs'; then
  CHILD=$(docker exec "$API" sh -c 'cat /proc/1/task/*/children' | tr -d ' \n')
  echo "api process: pid $CHILD ($(docker exec "$API" sh -c "tr '\0' ' ' < /proc/$CHILD/cmdline" | awk '{print $1, $2}'))"
  E=$(docker exec "$API" cat "/proc/$CHILD/environ" | pick)
else
  echo "pid 1 has $kids children or is not launch.mjs — not guessing which process is the API"; E=unreadable
fi
echo "$KEY in API process environment: $E ($(meaning "$E"))"

h "F4 verdict"
if [ "$E" != unreadable ] && [ "$(meaning "$F")" = "$(meaning "$M")" ] && [ "$(meaning "$M")" = "$(meaning "$E")" ] && [ "$(meaning "$E")" != invalid ]; then
  echo "EFFECTIVE $KEY: $(meaning "$E") (file, mount and process agree)"
else
  echo "EFFECTIVE $KEY: UNKNOWN (sources disagree or unreadable) — do not change anything; review manually"
fi
[ "$(meaning "$F")" = "$(meaning "$E")" ] || echo "NOTE: the deployed file differs from the running process; a restart would change the effective value"

h "E1 what is already approved and would answer publicly when the flag is on (read-only)"
q() { docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' "$PG" psql -v ON_ERROR_STOP=1 -U docversity_owner -d docversity_university -AtF ' | ' </dev/null -c "$1"; }
q "with cur as (select distinct on (program_id, service) * from verification_policies where status='APPROVED' order by program_id, service, created_at desc, id desc)
   select c.service, p.code, coalesce(c.definition->>'usage','-'),
     coalesce(c.definition #>> '{publicDisclosure,anonymousLookup}','false') as anonymous,
     coalesce((select string_agg(f,',') from jsonb_array_elements_text(c.definition #> '{publicDisclosure,fields}') f),'-') as fields,
     coalesce(c.definition #>> '{publicDisclosure,documentWithCredential}','false') as qr_document,
     coalesce(c.definition->>'discloseProgram','-')||'/'||coalesce(c.definition->>'discloseIssueDate','-') as program_issue_date
   from cur c join programs p on p.id=c.program_id order by 1,2"
echo "issued documents: $(q "select count(*) from certificates where status='ISSUED'")  published results: $(q "select count(*) from results where publication_status='PUBLISHED'")"
echo
echo "FLAG CHECK COMPLETE — read-only, nothing changed"
