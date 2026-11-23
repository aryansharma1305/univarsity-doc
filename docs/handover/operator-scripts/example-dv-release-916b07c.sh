#!/bin/bash
# Production release 916b07c2657b4cd6605c635ea9377f4a4c35878f (PR #58 + #59); no migrations (27 stays 27).
# Run (only after explicit approval): sudo bash /tmp/dv-release-916b07c.sh
# Order: baseline gate -> fresh capture -> precheck -> migrate (no pending; snapshot) -> api+web switch
#        (automatic image-only rollback if unhealthy) -> verify -> post-state.
# Never: down, -v, prune, migrate reset/down, DB restore, worker/postgres/redis/minio/proxy changes,
#        payment or verification-policy changes. Prints no secrets.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run with sudo"; exit 1; }
D=/opt/docversity/release-916b07c
P=docversity-university-407e5ed2
U=/opt/docversity/university-2efcea18-20261114/university
API_OLD=sha256:b448233164e1ce67ac08258bf0496a9f2cbaca22da9a814dd85b182a353b14ff
WEB_OLD=sha256:0cd31deb504ead296a46661bdfe8ac22a253ef689a25204981e43d63b4f0a7d2
WORKER=sha256:29aee3f1253b63f6c3bf036ffce911b8f7ffb4d31d3f64d47c3abd776ff8ce3a
API_NEW=sha256:8a3dc3930be1eee1ab77637b09f66563af8ccd868408b0e7cf2b4ddd4d60e63d
WEB_NEW=sha256:24c577bed777092926a9457219240eafb56ce1b51924386aacaeb4f36a769b36
TOOLS_NEW=sha256:1084161c08d3079591bb8c716d424f393604b553e4fab7d02432bb658967e9ca
DEPLOY_SCRIPT_SHA=efb5e9b54b730cb83519f0ef9edef3440eebfd8dceddbd5c84446f5e2e8e41dc
h() { echo; echo "=== $(date -u +%H:%M:%SZ) $*"; }
svc() { docker ps -q --no-trunc --filter "label=com.docker.compose.project=$P" --filter "label=com.docker.compose.service=$1"; }
img_of() { docker inspect -f '{{.Image}}' "$(svc "$1")"; }
containers() { for c in $(docker ps --filter "label=com.docker.compose.project=$P" --format '{{.Names}}' | sort); do
  docker inspect -f '{{.Name}} {{.Image}} {{if .State.Health}}{{.State.Health.Status}}{{end}} restarts={{.RestartCount}}' "$c"; done; }

h "0. baseline gate"
containers
n=$(docker ps --filter "label=com.docker.compose.project=$P" -q | wc -l)
[ "$n" = 6 ] && [ -n "$(docker ps -q --filter name=$P-public-proxy-1)" ] || { echo "ABORT: expected 6 project services + public proxy, got $n"; exit 1; }
[ "$(img_of api)" = "$API_OLD" ] || { echo "ABORT: api is not $API_OLD"; exit 1; }
[ "$(img_of uniweb-407e5ed2)" = "$WEB_OLD" ] || { echo "ABORT: web is not $WEB_OLD"; exit 1; }
[ "$(img_of worker)" = "$WORKER" ] || { echo "ABORT: worker is not $WORKER"; exit 1; }
for i in "$API_NEW" "$WEB_NEW" "$TOOLS_NEW" "$API_OLD" "$WEB_OLD"; do docker image inspect -f '{{.Id}} present' "$i" >/dev/null || { echo "ABORT: image $i missing"; exit 1; }; done
set -a; . "$D/deploy.env"; set +a
[ "$NEW_API" = "$API_NEW" ] && [ "$NEW_WEB" = "$WEB_NEW" ] && [ "$NEW_TOOLS" = "$TOOLS_NEW" ] && [ "$PREV_API" = "$API_OLD" ] && [ "$PREV_WEB" = "$WEB_OLD" ] && [ "$EXPECT_BEFORE" = 27 ] && [ "$MIGRATIONS_ADDED" = 0 ] \
  || { echo "ABORT: deploy.env does not match the approved images/rollback targets"; exit 1; }
[ ! -e "$U/compose.pre-release-916b07c.json" ] || { echo "ABORT: compose.pre-release-916b07c.json already exists (earlier attempt?) — stop and review"; exit 1; }
[ "$(sha256sum "$D/vps-deploy-portal.sh" | cut -d' ' -f1)" = "$DEPLOY_SCRIPT_SHA" ] || { echo "ABORT: deploy script differs from the reviewed version"; exit 1; }
. "$D/backup.env"; PREP_BACKUP=$BACKUP_DIR
(cd "$PREP_BACKUP" && python3 -c "
import json,hashlib
m=json.load(open('manifest.json')); bad=[f for f,h in m.items() if hashlib.sha256(open(f,'rb').read()).hexdigest()!=h]
print('preparation backup retained:',len(m),'files, mismatches:',len(bad)); assert not bad") || { echo "ABORT: preparation backup missing or changed"; exit 1; }
PG0=$(svc postgres)
pol=$(docker exec -e PGOPTIONS='-c default_transaction_read_only=on' "$PG0" psql -U docversity_owner -d docversity_university -Atc "select count(*) filter (where status='APPROVED')||'/'||count(*) filter (where definition ? 'publicDisclosure') from verification_policies" </dev/null)
# Report only: the college may activate disclosure (two-person approval) before or after this release.
echo "policies approved/publicDisclosure: $pol (this release changes no policy)"
echo "baseline OK: api/web/worker = approved rollback/unchanged images; new images present; deploy.env pinned"
BEFORE_OTHERS=$(for s in worker postgres redis minio; do echo "$s $(svc $s) $(docker inspect -f '{{.State.StartedAt}} {{.RestartCount}}' "$(svc $s)")"; done; docker inspect -f 'public-proxy {{.Id}} {{.State.StartedAt}} {{.RestartCount}}' $P-public-proxy-1)

h "1. fresh capture"
BK=$(sh "$D/vps-capture.sh" | tee /dev/stderr | tail -1)
(cd "$BK" && python3 -c "
import json,hashlib
m=json.load(open('manifest.json')); bad=[f for f,x in m.items() if hashlib.sha256(open(f,'rb').read()).hexdigest()!=x]
print('manifest verified:',len(m),'files, mismatches:',len(bad)); assert not bad")
echo "pre-release backup: $BK"

h "2. precheck";  (cd "$D" && bash vps-deploy-portal.sh precheck)
h "3. migrate (no pending migrations; records the rollback snapshot)"; (cd "$D" && bash vps-deploy-portal.sh migrate)
SW=0
h "4. switch api + web (auto image rollback on failed health)"; (cd "$D" && bash vps-deploy-portal.sh switch) || SW=$?
[ $SW = 0 ] || echo "SWITCH FAILED rc=$SW — automatic image rollback was attempted; schema kept"
h "5. verify"; (cd "$D" && bash vps-deploy-portal.sh verify) || echo "verify reported a problem"

h "6. post-state"
containers
echo "api=$(img_of api) web=$(img_of uniweb-407e5ed2) worker=$(img_of worker)"
[ "$(img_of api)" = "$API_NEW" ] && [ "$(img_of uniweb-407e5ed2)" = "$WEB_NEW" ] && echo "RELEASE ACTIVE: api/web on approved 916b07c images" || echo "NOT ON NEW IMAGES (rolled back?)"
AFTER_OTHERS=$(for s in worker postgres redis minio; do echo "$s $(svc $s) $(docker inspect -f '{{.State.StartedAt}} {{.RestartCount}}' "$(svc $s)")"; done; docker inspect -f 'public-proxy {{.Id}} {{.State.StartedAt}} {{.RestartCount}}' $P-public-proxy-1)
[ "$BEFORE_OTHERS" = "$AFTER_OTHERS" ] && echo "worker/postgres/redis/minio/public-proxy untouched (same IDs, start times, restarts)" || { echo "WARNING: an unchanged service changed:"; diff <(echo "$BEFORE_OTHERS") <(echo "$AFTER_OTHERS") || true; }
PG=$(svc postgres)
sq() { docker exec -e PGOPTIONS='-c default_transaction_read_only=on' "$PG" psql -U docversity_owner -d docversity_university -Atc "$1" </dev/null; }
echo "migrations finished=$(sq "select count(*) from _prisma_migrations where finished_at is not null") failed=$(sq "select count(*) from _prisma_migrations where finished_at is null or rolled_back_at is not null")"
echo "new tables: $(sq "select string_agg(t, ',' order by t) from unnest(array['message_threads','thread_messages','verification_queries','notifications']) t where to_regclass('public.'||t) is not null")"
echo "result_publications.verification_token: $(sq "select count(*) from information_schema.columns where table_name='result_publications' and column_name='verification_token'") column"
echo "policies approved=$(sq "select count(*) from verification_policies where status='APPROVED'") publicDisclosure=$(sq "select count(*) from verification_policies where definition ? 'publicDisclosure'")"
echo "students=$(sq 'select count(*) from students') registrations=$(sq 'select count(*) from student_registrations') users=$(sq 'select count(*) from users') policies_approved=$(sq "select count(*) from verification_policies where status='APPROVED'")"
h "done (switch rc=$SW)"
