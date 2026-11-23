#!/bin/bash
# Docversity release 916b07c (PR #58 registration status banner + PR #59 document QR delivery; NO migrations)
# PREPARATION ONLY. Run as: sudo bash /tmp/dv-prep-916b07c.sh
# Does: stage + verify artifact, docker load (adds images only), fresh capture, isolated DB restore,
# isolated MinIO restore, schema check on the restored copy (27 migrations, none added), policy report,
# deploy precheck. Never: compose up/down, container switch, production migration, prune, rm images.
set -euo pipefail
umask 077
[ "$(id -u)" = 0 ] || { echo "run with sudo"; exit 1; }
SHA=916b07c2657b4cd6605c635ea9377f4a4c35878f
ZIP_DIGEST=c1be444ca275ba3e5010e511ba3e00819b44075513bfda71c550a41679bf4495
declare -A EXPECT=([api]=sha256:8a3dc3930be1eee1ab77637b09f66563af8ccd868408b0e7cf2b4ddd4d60e63d
                   [web]=sha256:24c577bed777092926a9457219240eafb56ce1b51924386aacaeb4f36a769b36
                   [tools]=sha256:1084161c08d3079591bb8c716d424f393604b553e4fab7d02432bb658967e9ca
                   [worker]=sha256:e28434624366fcb3798281f98b48be751bc467e0fcf7b607100a024d91a3cf63)
OLD=/opt/docversity/release-0071bdb
D=/opt/docversity/release-916b07c
SRC=/home/dvops/release-916b07c
P=docversity-university-407e5ed2
U=/opt/docversity/university-2efcea18-20261114/university
step() { echo; echo "=== $*"; }
running() { docker ps -q --no-trunc | sort | sha256sum | cut -c1-16; }
BEFORE=$(running)

step "0. production services"
docker ps --filter "label=com.docker.compose.project=$P" --format '{{.Names}} {{.Status}}' | sort
docker ps --format '{{.Names}} {{.Status}}' | grep -c "(healthy)" | sed 's/^/healthy containers: /'

step "1. stage artifact"
mkdir -p -m 700 "$D"
[ -f "$D/artifact.zip" ] || install -m 600 -o root -g root "$SRC/artifact.zip" "$D/artifact.zip"
got=$(sha256sum "$D/artifact.zip" | cut -d' ' -f1)
[ "$got" = "$ZIP_DIGEST" ] || { echo "ABORT: zip sha256 $got != GitHub artifact digest"; exit 1; }
echo "zip sha256 matches GitHub artifact 14753886230 digest"
rm -rf "$D/release"; python3 - "$D" <<'PY'
import zipfile,pathlib,sys
d=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(d/'artifact.zip')
for i in z.infolist():
    p=pathlib.PurePosixPath(i.filename); assert not p.is_absolute() and '..' not in p.parts, i.filename
z.extractall(d/'release')
PY
(cd "$D/release" && sha256sum -c SHA256SUMS)
python3 -c "import json;m=json.load(open('$D/release/images.json'));assert m['commit']=='$SHA',m['commit'];assert m['architecture']=='linux/amd64';print('images.json commit',m['commit'],m['architecture'])"

step "2. scripts, verify + load"
for f in vps-deploy-portal.sh vps-capture.sh vps-restore-test.sh; do install -m 700 "$OLD/$f" "$D/$f"; done
echo "migrations: none in this release (packages/database identical to 21d9146)"
# Each release needs its own pre-release compose snapshot: an earlier snapshot name would roll back
# to the wrong images.
sed -i -e 's/compose\.pre-portal-pr51\.json/compose.pre-release-916b07c.json/' \
       -e 's/\$((EXPECT_BEFORE + 1))/$((EXPECT_BEFORE + MIGRATIONS_ADDED))/g' "$D/vps-deploy-portal.sh"
grep -q 'compose.pre-release-916b07c.json' "$D/vps-deploy-portal.sh" && ! grep -q 'EXPECT_BEFORE + 1' "$D/vps-deploy-portal.sh" \
  || { echo "ABORT: deploy script patch failed"; exit 1; }
[ ! -e "$U/compose.pre-release-916b07c.json" ] || { echo "ABORT: snapshot for this release already exists"; exit 1; }
echo "deploy script: snapshot compose.pre-release-916b07c.json, expects +0 migrations"
T=$(awk '$2=="images.tar.gz"{print $1}' "$D/release/SHA256SUMS"); J=$(awk '$2=="images.json"{print $1}' "$D/release/SHA256SUMS")
python3 - "$OLD/verify-classic-release.py" "$D/verify-classic-release.py" "$SHA" "$T" "$J" <<'PY'
import re,sys
src,dst,sha,t,j=sys.argv[1:]; s=open(src).read()
s=re.sub(r"SHA='[0-9a-f]{40}'",f"SHA='{sha}'",s,count=1)
s=re.sub(r"PINS=\{'images.tar.gz':'[0-9a-f]+',\n(\s+)'images.json':'[0-9a-f]+'\}",lambda m:f"PINS={{'images.tar.gz':'{t}',\n{m.group(1)}'images.json':'{j}'}}",s)
assert sha in s and t in s and j in s; open(dst,'w').write(s)
PY
(cd "$D" && python3 verify-classic-release.py --release release --output classic 2>&1 | tail -1)
docker load -i "$D/release/images.tar.gz" </dev/null | tail -4
(cd "$D" && python3 verify-classic-release.py --release release --output classic-engine --verify-engine 2>&1 | tail -1)
python3 - "$D" <<'PY'
import json,sys
d=sys.argv[1]; m=json.load(open(f'{d}/classic-engine/classic-image-mapping.json'))['images']
open(f'{d}/release.env','w').write(''.join(f'NEW_{k.upper()}={m[k]["configID"]}\n' for k in ('api','web','tools','worker')))
PY
cat "$D/release.env"
for k in api web tools worker; do
  v=$(sed -n "s/^NEW_${k^^}=//p" "$D/release.env")
  [ "$v" = "${EXPECT[$k]}" ] || { echo "ABORT: $k loaded $v != expected ${EXPECT[$k]}"; exit 1; }
  docker image inspect -f "$k {{.Id}} {{.Architecture}} user={{.Config.User}}" "$v"
done
echo "loaded image IDs = CI-recorded config digests for 916b07c (worker image loaded but NOT deployed)"

step "3. fresh capture"
BK=$(sh "$D/vps-capture.sh" | tee /dev/stderr | tail -1)
[ -f "$BK/database.dump" ] || { echo "ABORT: capture failed"; exit 1; }
(cd "$BK" && python3 -c "
import json,hashlib
m=json.load(open('manifest.json')); bad=[f for f,h in m.items() if hashlib.sha256(open(f,'rb').read()).hexdigest()!=h]
print('manifest verified:',len(m),'files, mismatches:',len(bad)); assert not bad")
echo "BACKUP_DIR=$BK" > "$D/backup.env"

step "4. isolated database restore"
sh "$D/vps-restore-test.sh" "$BK"

step "5. restored copy: schema already at the release's 27 migrations"
IMG=$(docker inspect -f '{{.Config.Image}}' $P-postgres-1); N=dv-migtest-$$
docker run -d --rm --name $N --network none -e POSTGRES_PASSWORD=migration-test-only -e POSTGRES_USER=docversity_owner -e POSTGRES_DB=docversity_university "$IMG" >/dev/null </dev/null
trap 'docker rm -f $N >/dev/null 2>&1 || true' EXIT
i=0; until docker exec $N pg_isready -U docversity_owner -d docversity_university >/dev/null 2>&1 </dev/null; do i=$((i+1)); [ $i -lt 60 ]; sleep 1; done; sleep 2
docker exec -i $N pg_restore --no-owner --no-acl -U docversity_owner -d docversity_university --exit-on-error < "$BK/database.dump"
q(){ docker exec -i $N psql -v ON_ERROR_STOP=1 -U docversity_owner -d docversity_university -Atq "$@"; }
m=$(q -c "select 'finished='||count(*) filter (where finished_at is not null)||' failed='||count(*) filter (where finished_at is null or rolled_back_at is not null) from _prisma_migrations" </dev/null)
echo "restored migrations: $m (expect finished=27 failed=0)"
[ "$m" = "finished=27 failed=0" ] || { echo "ABORT: restored schema is not at 27 migrations"; exit 1; }
last=$(q -c "select migration_name from _prisma_migrations order by migration_name desc limit 1" </dev/null)
echo "latest migration: $last"; [ "$last" = "20261129090000_result_verification_token" ] || { echo "ABORT: unexpected latest migration"; exit 1; }
docker rm -f $N >/dev/null; trap - EXIT

step "6. isolated MinIO restore of $BK/objects"
IMGM=$(python3 -c "import json;print(json.load(open('$U/compose.json'))['services']['storage-tools']['image'])")
W=$(mktemp -d /opt/docversity/minio-restore-test.XXXXXX); NM=dv-minio-restore-$$
trap 'docker rm -f $NM >/dev/null 2>&1 || true; rm -rf "$W"' EXIT
cp -a "$BK/objects" "$W/src"; chmod -R a+rX "$W/src"; mkdir -m 777 "$W/data" "$W/out"
docker run -d --rm --name $NM --network none -v "$W/data:/data" -v "$W/src:/src:ro" -v "$W/out:/out" \
  -e MINIO_ROOT_USER=restoretest -e MINIO_ROOT_PASSWORD=restore-test-only-$$ --entrypoint minio "$IMGM" server /data --address 127.0.0.1:9000 >/dev/null
mcx() { docker exec -e MC_CONFIG_DIR=/tmp/.mc -e "MC_HOST_t=http://restoretest:restore-test-only-$$@127.0.0.1:9000" $NM mc "$@"; }
i=0; until mcx ready t >/dev/null 2>&1; do i=$((i+1)); [ $i -lt 60 ] || { echo "minio not ready"; exit 1; }; sleep 1; done
mcx mb --quiet t/restore >/dev/null; mcx mirror --quiet /src t/restore >/dev/null; mcx mirror --quiet t/restore /out >/dev/null
src=$(find "$W/src" -type f | wc -l); bad=$(cd "$BK/objects" && find . -type f | while read -r f; do cmp -s "$f" "$W/out/$f" || echo x; done | wc -l)
prod=$(docker compose -p $P -f $U/compose.json --profile operator run --rm --no-deps storage-tools ls --recursive local/docversity-university 2>/dev/null | wc -l)
echo "objects backup=$src restored-mismatches=$bad production=$prod"
[ "$bad" = 0 ] && [ "$src" = "$prod" ] && echo "MINIO RESTORE: PASS" || { echo "MINIO RESTORE: FAIL"; exit 1; }
docker rm -f $NM >/dev/null; rm -rf "$W"; trap - EXIT

step "7. policy report and storage privacy (read-only; activation by the college is expected)"
PG=$(docker ps -q --filter "label=com.docker.compose.project=$P" --filter "label=com.docker.compose.service=postgres")
sq() { docker exec -e PGOPTIONS='-c default_transaction_read_only=on' "$PG" psql -U docversity_owner -d docversity_university -Atc "$1" </dev/null; }
echo "approved policies=$(sq "select count(*) from verification_policies where status='APPROVED'") with publicDisclosure=$(sq "select count(*) from verification_policies where definition ? 'publicDisclosure'")"
docker compose -p $P -f $U/compose.json --profile operator run --rm --no-deps storage-tools anonymous get local/docversity-university 2>&1 | tail -1

step "8. deploy precheck (read-only)"
{ cat "$D/release.env"
  echo "PREV_API=sha256:b448233164e1ce67ac08258bf0496a9f2cbaca22da9a814dd85b182a353b14ff"
  echo "PREV_WEB=sha256:0cd31deb504ead296a46661bdfe8ac22a253ef689a25204981e43d63b4f0a7d2"
  echo "EXPECT_BEFORE=27"
  echo "MIGRATIONS_ADDED=0"; } > "$D/deploy.env"
set -a; . "$D/deploy.env"; set +a
bash "$D/vps-deploy-portal.sh" precheck

step "9. disk + safety"
df -h / | tail -1
[ "$BEFORE" = "$(running)" ] && echo "running containers unchanged: yes" || echo "WARNING: running container set changed"
echo "PREP COMPLETE — nothing switched, production migrations not applied"
