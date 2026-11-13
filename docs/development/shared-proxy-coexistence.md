# Shared proxy coexistence and resource-safe university preparation

This branch prepares infrastructure only. Local validation uses fresh synthetic Docker resources.
No VPS login or mutation, DNS/TLS change, real account, student upload/import or payment activation
was performed. Commands below are future operator references requiring explicit approval. Use
synthetic fixtures for rehearsal; do not operate existing environments during local tests.

## Operator handover order

After release/review approval and separate VPS authorization: take a fresh accepted staging backup;
prepare the shared bundle, original-proxy rollback record and approved limits; initialize the private
university project/network and verify migrations/emptiness; hand off the listener; prove staging
reviewer protection and university isolation; create the approved mentor/staff accounts; configure
approved academic masters/session; preview and obtain approval for all 58 registrations before commit;
issue individual activation codes through authorized channels; verify pilot login, DOB/photo review,
independent recovery and mentor acceptance. Payments remain disabled.

The private university frontend network must exist before the shared edge can attach to it. Therefore
private provisioning/migrations below precede the listener handoff; accounts, records and user access
remain separate later stages. This dependency does not authorize uploading real data. Complete exact
commands and rollback follow; institutional inputs and approvals are in the launch packet.

## Architecture and ownership

`docversity14h` remains the synthetic reviewer environment. A new `docversity-university-<nonce>`
owns its own PostgreSQL cluster/database, Redis, private MinIO, runtime keys, volumes and backend.
One university database serves all authorized staff and students. `docversity-edge` owns only the
public Caddy process, TCP 80/443 and routing. Neither application owns its lifecycle.

| Edge attachment                  | Purpose                                                                   |
| -------------------------------- | ------------------------------------------------------------------------- |
| Existing staging edge network    | Staging web traffic                                                       |
| Existing staging backend network | Preserve the existing gated `/health` → API behavior                      |
| New university frontend network  | Only `uniweb-<nonce>`; never university PostgreSQL/Redis/MinIO/API/worker |

The existing proxy already has staging backend access. This migration preserves that trust boundary;
it does not give the edge university backend access or any database/session/object credentials.
The edge mounts the existing reviewer bcrypt gate as a file secret, without changing/copying its
password. Existing Caddy certificate/config volumes are external references, not reinitialized copies.
Only one Caddy may use those volumes at a time. Never start both proxies against them.

Staging imports the unchanged `review-site.caddy`: all application/API/download/health routes require
reviewer authentication, except the deliberate robots.txt exclusion. University has a separate
approved hostname and its own application login. No path-prefix multiplexing or shared staff password.
Unknown hosts have no application fallback. Strict SNI/Host matching is enabled. Caddy overwrites
forwarding headers; Caddy → Next → API remains two trusted hops (`TRUST_PROXY=2`).

`--shared-proxy` gives university no host ports and no proxy service. Its frontend and backend are
internal networks. The unique **service name** `uniweb-<nonce>` avoids Compose's automatic `web` DNS
alias, which an extra custom alias would not remove. `prepare-public-candidate` refuses this mode.

The edge has no application `depends_on` entries and its container liveness does not depend on either
application. Stage maintenance therefore does not make the university proxy unhealthy. Application
health, reviewer denial and real HTTPS must be monitored separately from proxy liveness.

## Implemented controls

- `deploy/coexist/prepare.py` writes a new private offline edge bundle and staging resource overlay.
  It refuses overwrite, unsafe paths, wrong staging identity/origin, malformed/writable reviewer gate,
  conflicting hostnames, university public ports and backend/edge network leakage. It invokes no Docker.
- The edge's startup wrapper validates the reviewer gate on every Docker restart before executing
  Caddy, including rejection of a syntactically valid but empty snippet. File reloads still require
  explicit gate/config validation and approved hash updates.
- `clean.py prepare --shared-proxy` generates independent university resources and secrets, no seeds
  or staff accounts. Its printed infrastructure plan migrates/checks emptiness without creating users.
- Installing the bundle's read-only `shared-edge.json` and setting `sharedProxy: true` in staging's
  existing instance metadata is the explicit adoption step. The updated launcher checks project/origin,
  gate and bundle hashes. The independent flag prevents a lost marker from reverting proxy ownership.
  Corrupt metadata fails closed instead of falling back to starting/stopping the old proxy.
- Shared-mode staging `up`, `stop` and `backup` exclude the proxy. Failed reviewer probes stop only
  staging web/API, preserving university ingress. `gate-check` probes without starting the stack.
- `retire-proxy` and `resume-proxy` affect only the original proxy before adoption/after approved rollback.
  Recovery targets do not inherit public or shared-edge overlays. Existing non-shared behavior remains.

These guards require this reviewed launcher version. Disable old launcher invocations in operator
aliases, timers and automation before adoption. Never run lifecycle commands from a different checkout,
remove a broken adoption marker to bypass it, or use raw Compose to operate staging. Root/Docker access
can still override application boundaries; both environments share one kernel, disk and outage domain.

## Measured inputs and provisional budget

Owner-reported host: Ubuntu 24.04.5, 2 vCPU, 7.8 GiB RAM, 96 GB disk with about 83 GB available,
766 MiB combined application/recovery idle use, load 0.27/0.24/0.18, no swap, public SSH 22, and an
existing Caddy on 80/443. These facts were supplied by the owner, not independently measured here.
Idle measurements do not certify PDF/photo/import peaks or simultaneous use.

| Service    | University MiB / CPU | Staging MiB / CPU |
| ---------- | -------------------- | ----------------- |
| API        | 1024 / 0.30          | 640 / 0.10        |
| Worker     | 512 / 0.10           | 320 / 0.05        |
| Web        | 512 / 0.20           | 384 / 0.05        |
| PostgreSQL | 512 / 0.10           | 384 / 0.03        |
| Redis      | 192 / 0.03           | 384 / 0.02        |
| MinIO      | 320 / 0.05           | 384 / 0.02        |
| Total      | 3072 / 0.78          | 2496 / 0.27       |

Shared edge: **128 MiB / 0.75 CPU**, 4096 CPU shares. University services have 512 shares each,
staging services 128 each. Shares prioritize short authentication bursts under contention; they do
not reserve CPU or override the hard limits. Steady ceilings total **5696 MiB (5.5625 GiB), 1.8 CPUs**,
leaving 0.2 CPU nominal headroom on the reported two-core host. This is a proposed small-launch budget;
application throughput and OS/daemon contention must pass the target-host acceptance before adoption.
Reserve 1536 MiB for host/Docker and 512 MiB for **one** operator job: 7744 MiB total, below the reported
7.8 GiB with only about 243 MiB additional margin. An operator job is capped at 0.10 CPU and requires
quiescing that environment's API/web/worker first; do not overlap operator jobs across environments.
Encryption/transfer after writers restart also needs that 0.10-CPU cap (total <=1.9 CPUs); pause it if
host headroom deteriorates. A ceiling sum is not proof of free RAM, bounded kernel/cache overhead or
acceptable latency. Memory limits and the bcrypt work factor are unchanged.

The previous 0.1-CPU cap caused cold bcrypt to be quota-throttled for approximately 17 seconds;
0.25 and 0.5 CPU also missed the declared two-second cold-p95 goal locally. See
[repeatable performance evidence and acceptance gates](shared-proxy-performance.md). Do not apply the
new caps until exact-source native CI, review and the authorized Hostinger acceptance have passed.
Stop/cap separately approved idle recovery services before testing;
they are not included in the steady budget. Preserve all recovery volumes/images/backups.

Every new shared-mode service sets `memswap_limit == mem_limit`. University Redis uses a new 96 MiB
no-eviction ceiling inside 192 MiB; staging keeps its existing 192 MiB Redis setting and gets 384 MiB
container headroom. Test Redis/AOF rewrite peaks and Chromium/photo/PDF memory before accepting these
limits. Do not change staging secrets/Redis configuration merely to make a smaller budget pass.
Worker/import concurrency remains one. University CPU shares exceed staging's; CPU ceilings bound
synthetic activity. Do not run builds, parallel imports, PDF stress and restores together on the VPS.

No swap is added by this change. Prefer a validated RAM budget first. Optional small encrypted host
swap may provide an emergency buffer only after separate approval and a persistent encryption/reboot
design; it is not capacity. Do not place personal data/keys in unencrypted swap, disable the OOM killer,
or set unlimited swap. Ensure old/recovery containers also have reviewed swap policies before adding
host swap. Any OOM, sustained swapping or loss of reserve blocks launch and requires a smaller workload
or a resource upgrade. [Docker memory/swap semantics](https://docs.docker.com/engine/containers/resource_constraints/).

## Release and read-only host gate — not executed

1. Review this branch, pass CI including pinned Caddy checks, and approve an exact immutable source
   SHA and complete API/worker/web/tools archive. The previous homepage release is not a release of
   these new launcher changes. Preserve all existing release archives/identities and backup generations.
2. After separate SSH authorization, verify host key, operator/console access, architecture, resource
   inputs, current project/source/image IDs, mounts/volumes/networks, backup integrity and port owners.
   Record only selected inspect fields, never raw environment or secret files. Example diagnostics:

```bash
uname -m
free -h
df -h
df -i
docker compose ls
docker stats --no-stream
docker ps -a --format '{{.ID}} {{.Names}} {{.Image}} {{.Status}} {{.Ports}}'
docker network ls
docker volume ls
sudo ss -lntup
test -z "${DOCKER_HOST:-}"
test -z "${DOCKER_CONTEXT:-}"
docker context inspect --format '{{.Endpoints.docker.Host}}'
```

Require a local Unix-socket engine. Confirm current staging is actually `docversity14h`, its Caddy
pin/mounts match this design, and certificate volume names are `docversity14h_caddy` and
`docversity14h_caddy_config`. If names/configuration differ, stop and adapt/review the plan. Do not
guess existing resources. Retain container IDs/start times and rollback metadata before mutation.

3. Set up/verify encrypted off-server backup and an isolated restore **before real workbook upload**.
   See [backup/recovery](shared-proxy-recovery.md). Take an accepted staging recovery point before its
   resource changes or edge handoff. Backup currently interrupts staging until adoption, so schedule it.

## Offline bundle preparation — future authorized provisioning

Set approved absolute paths outside the checkout. Keep `STAGING_SOURCE` at the original staging path,
with its existing `.local/staging`. Update that control checkout to the reviewed release only after
preserving its original ref and all private state. Do not initialize another `docversity14h` or copy
another instance's `.env`/`.local`. Load/verify all four immutable images and retag only the exact IDs
for staging as described in the existing Hostinger runbook. Never build on the constrained VPS.

```bash
set -euo pipefail
umask 077
: "${CONTROL_SOURCE:?Reviewed clean source checkout}"
: "${APPROVED_SHA:?Full approved source SHA}"
: "${RELEASE_DIR:?Verified matching archive directory}"
: "${UNIVERSITY_DIR:?Fresh private university directory}"
: "${UNIVERSITY_ORIGIN:?Approved distinct https://hostname}"
: "${STAGING_SOURCE:?Original staging checkout and unchanged private state}"
: "${EDGE_DIR:?Fresh private edge bundle directory}"
: "${ACME_EMAIL:?Approved certificate contact}"
export IMAGE_TAG="$APPROVED_SHA"
cd "$CONTROL_SOURCE"
test "$(git rev-parse HEAD)" = "$APPROVED_SHA"
test -z "$(git status --porcelain)"
python3 deploy/university/clean.py prepare --shared-proxy \
  --directory "$UNIVERSITY_DIR" --origin "$UNIVERSITY_ORIGIN" \
  --images "$RELEASE_DIR/images.json"
python3 deploy/university/clean.py validate-release \
  --directory "$UNIVERSITY_DIR" --approved-sha "$APPROVED_SHA"
python3 deploy/coexist/prepare.py --directory "$EDGE_DIR" \
  --university-directory "$UNIVERSITY_DIR" \
  --staging-state "$STAGING_SOURCE/.local/staging" \
  --staging-origin https://verify.thedocversity.com --acme-email "$ACME_EMAIL"
```

Preparation writes private configuration only. It neither authorizes nor starts anything. Save bundle
hashes and review identities, all mounts, runtime keys, limits and ports. No secrets are printed.

## Apply resource ceilings before concurrent university application use

This is a separate live approval, after a synthetic rehearsal of these limits. Prefer `docker update`
for the initial limits change so staging data/application containers need not restart. Schedule low
activity, confirm observed per-service use/peaks are below the new cap with margin, and save selected
HostConfig limits for rollback first. Do not lower memory below observed use. Quiesce separately
approved unused recovery containers; do not delete their resources. The following is an operator
reference, never a script executed by offline preparation:

```bash
python3 - "$EDGE_DIR/staging-overlay.json" <<'PY'
import json, subprocess, sys
services=json.load(open(sys.argv[1]))['services']
for service in ('api','worker','web','postgres','redis','minio'):
    ids=subprocess.check_output(['docker','ps','-q','--filter','label=com.docker.compose.project=docversity14h',
                                 '--filter','label=com.docker.compose.service='+service],text=True).split()
    assert len(ids)==1, 'Expected exactly one original staging service'
    limit=services[service]
    subprocess.run(['docker','update','--memory',limit['mem_limit'],'--memory-swap',limit['memswap_limit'],
                    '--cpus',str(limit['cpus']),'--cpu-shares',str(limit['cpu_shares']),
                    '--pids-limit',str(limit['pids_limit']),ids[0]],check=True)
PY
```

Verify actual limits, OOM/restarts, latency and reviewer access immediately. A failed cap blocks the
next stage; restore recorded previous limits under the approved rollback decision. The generated
Compose overlay persists the desired ceilings for later reconciliation. Compose may recreate services
when reconciling its configuration hash; schedule that separately rather than claiming it is seamless.

## Private university initialization — no public cutover yet

Derive the exact project and web service from the private record; do not guess names. Every command
must select this university project explicitly. Infrastructure/account/import approval stages are
separate. No fixture or seed command is permitted.

```bash
export UNIVERSITY_PROJECT="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["project"])' "$UNIVERSITY_DIR/instance.json")"
export UNIVERSITY_WEB="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["webService"])' "$UNIVERSITY_DIR/instance.json")"
u() { docker compose --project-name "$UNIVERSITY_PROJECT" -f "$UNIVERSITY_DIR/compose.json" "$@"; }
e() { docker compose --project-name docversity-edge -f "$EDGE_DIR/compose.json" "$@"; }
u config --quiet
e config --quiet
u pull postgres redis minio
u up --no-build -d --wait postgres redis minio
u --profile operator run --rm --no-deps migrate
u --profile operator run --rm --no-deps migrate \
  node packages/database/node_modules/prisma/build/index.js migrate status \
  --config packages/database/prisma.config.ts
u --profile operator run --rm --no-deps check-empty
u up --no-build -d --wait api worker "$UNIVERSITY_WEB"
```

Check all exits, expected migration names/checksums, no unfinished migrations, zero users and academic
records, least-privilege DB roles/private object policy, new volume labels, no staging credential/mount
references, and no published university ports. No actual database verification occurred in this task.

## One-time edge cutover — bounded external HTTP interruption

Preconditions: separate routing/TLS approval, approved university hostname/DNS, healthy private
university services, resources accepted, old proxy/certificate image IDs recorded, recovery accepted,
new staging controller installed at the original source/state path, and `docversity-edge` project unused.
Verify its external networks/volumes exist and match inventory. Keep the old proxy container and image.

Before stopping anything, validate the candidate with the **pinned** Caddy, reviewer gate and staged
paths in an isolated no-network/no-host-port rehearsal. `caddy adapt` is a parser check, not full runtime
acceptance. `caddy validate` provisions config but does not run the server. Do not use production
certificate volumes concurrently for rehearsal. Require CI `deploy/coexist/caddy_regression.py` success
and trusted-TLS synthetic two-site acceptance before authorizing this live handoff.

Monitor existing staging anonymously/with reviewer authentication from an authorized external client
throughout the window. Do not put credentials in command arguments, logs, browser traces or chat.

```bash
cd "$STAGING_SOURCE"
test "$(git rev-parse HEAD)" = "$APPROVED_SHA"
python3 deploy/scripts/staging.py gate-check
python3 deploy/scripts/staging.py retire-proxy
# The old Caddy is now stopped. Do not run old staging lifecycle automation.
test ! -e .local/staging/shared-edge.json
test ! -L .local/staging/shared-edge.json
test ! -e "$EDGE_DIR/staging-instance.before.json"
cp -p .local/staging/instance.json "$EDGE_DIR/staging-instance.before.json"
python3 - .local/staging/instance.json <<'PY'
import json, os, pathlib, sys
path=pathlib.Path(sys.argv[1])
record=json.loads(path.read_text())
assert not record.get('sharedProxy')
record['sharedProxy']=True
temporary=path.with_name('instance.shared.tmp')
with temporary.open('x') as output: output.write(json.dumps(record,indent=2)+'\n')
temporary.chmod(0o444)
os.replace(temporary,path)
PY
install -m 0444 "$EDGE_DIR/shared-edge.json" .local/staging/shared-edge.json
e up --no-build -d --wait proxy
python3 deploy/scripts/staging.py gate-check
python3 deploy/scripts/staging.py status
e ps
```

Do not run ordinary staging `stop` as the handoff. Do not recreate PostgreSQL/Redis/MinIO or start a
second proxy on 80/443. The first handoff has a stop/start binding interval on one IP, plus possible
certificate issuance time for the new hostname. A zero-interruption guarantee requires an already
approved external load balancer/second address; it is not supplied here. The staging apps/database
remain running. Existing reviewer HTTPS certificates are reused. Require trusted external HTTPS,
correct Host/SNI, anonymous/wrong gate 401 on staging, authenticated staging health 200, university
home/login behavior, API/CSRF/cookie/role checks and no backend listeners before allowing access.

After adoption, use only the updated staging launcher. Its `stop`/`backup`/`up` leave the edge alone.
University operations use `u`, never staging credentials or project names. Never use whole-host
Docker prune/stop/reset or volume-removing cleanup. Application backup windows can briefly interrupt
that application's traffic, but must not stop the other environment or edge.

## Rollback

Before real university writes, if edge acceptance fails: close university access, **stop the new edge
first**, verify it exited and released ports/volume writers, preserve its files/logs, then move the
valid adoption marker aside and resume the original proxy. Staging data services remain untouched:

```bash
u stop "$UNIVERSITY_WEB" api
u stop worker
e stop proxy
e ps --all
cd "$STAGING_SOURCE"
# Only as this documented whole-handoff rollback, not to bypass a corrupt marker.
mv .local/staging/shared-edge.json "$EDGE_DIR/shared-edge.rollback.json"
install -m 0444 "$EDGE_DIR/staging-instance.before.json" .local/staging/instance.json
python3 deploy/scripts/staging.py resume-proxy
python3 deploy/scripts/staging.py gate-check
```

If a failed reviewer probe already stopped staging web/API, use `staging.py up` after moving the
marker and stopping university/edge, instead of `resume-proxy`. This restores approved staging apps
on their original volumes and performs preflight/gate checks; it may reconcile/recreate app containers.
Do not expect a proxy-only restart to repair stopped applications. Require the approved image tag,
healthy data services and migration compatibility first.

For an early failure before marker installation, skip its `mv`; never overwrite an existing rollback
record. Verify old proxy image/mounts/gate and external TLS. Preserve university resources for inspection.
Resource rollback restores recorded prior limits, not volume contents. Do not change DNS implicitly.

After university writes, returning users to the synthetic database is forbidden. Enter maintenance,
preserve DB/objects/queues/audit, restore compatible edge/app configuration or use a separately approved
isolated university restore with post-backup data-loss accounting. No schema downgrade is automated.

For future approved route changes, retain the directory mount, validate a new config and gate, stage
atomic file replacement, update/review bundle hashes and the read-only adoption record, then send
`e kill -s USR1 proxy`. Despite its CLI name, this sends a reload signal, not SIGKILL. Verify same
container ID/start time, new routes, both auth boundaries and logs; signal delivery is not proof of a
successful reload. Keep the previous validated config/record for the same graceful rollback. Never
enable the public admin API or `--watch`. Signal support/start arguments must be verified for the
actual pin before live use. [Caddy reload conditions](https://caddyserver.com/docs/command-line#signals).

## Load and acceptance plan

Run on an approved synthetic rehearsal first, then on this host only with separate authorization.
Never load-test real student accounts or append synthetic students to the intended university DB.

1. Capture 24-hour baseline and per-container peaks; account for every recovery/operator workload.
2. Agree expected active users, import/photo/PDF rates and p95 goals with the mentor. Starting test
   profile: university 1 → 5 → 10 concurrent synthetic users, 2 reviewers on staging, one import worker,
   and at most 2 photo uploaders. These are proposed test loads, not claimed demand/capacity.
3. Warm up 5 minutes, hold each step 15 minutes and soak the agreed peak 60 minutes. Exercise login,
   correct/wrong auth, student A/B ownership, CSRF/origin rejection, 58-row import preview/replay,
   activation expiry/reuse/attempt limit, photos/DOB review, private object reads and disabled payments.
4. Run a staging stop/backup and university backup independently. Verify other-site continuity and
   unchanged edge identity. Rehearse failed gate probe, wrong university image, worker restart/retry,
   Redis/AOF pressure and approved isolated restore. Do not induce OOM/disk exhaustion on a shared host.
5. Capture p50/p95/p99/error rates, CPU/steal/load, available RAM/swap, OOM/restarts, DB latency/disk/inodes,
   Redis memory/AOF, queues and storage latency. Proposed goals: p95 login/page <2 seconds, non-upload
   HTTP errors <1%, zero unexpected auth/ownership successes, zero OOM/restarts, sustained CPU <75%,
   available RAM >20%, disk >20% free and queue age <120 seconds. Negotiate goals before testing.
6. Stop at a limit breach, repeated 5xx, auth/isolation failure, rising queue, backup refusal or OOM.
   Investigate and reduce load/change approved ceilings or upgrade. Do not simply raise limits until
   the host loses reserve. Recheck affected cases after any change.

Reuse valid sessions and stagger login/activation attempts during sustained load. Expected 401/403/429
responses in negative cases are security successes, not generic availability failures. Measure TLS,
reviewer bcrypt and gzip/photo peaks on the edge's proposed CPU budget; increase/reallocate only after
review if it misses the goals. Never weaken the existing gate work factor, auth throttles or upload
validation to make a benchmark pass.

## SSH, patches, reboot and monitoring

Public SSH 22 requires an access review. Verify the Hostinger recovery console, tested second key
session and an approved non-root sudo operator before tightening rules. Review `sshd -T`, socket
activation and IPv4/IPv6/UFW/Docker firewall behavior. Prefer key-only access and approved source
CIDRs/VPN; do not guess a CIDR, enable a firewall blindly or disable the only working operator login.
After an approved config change run `sudo sshd -t`, reload `ssh.service`, and prove a new key session
while retaining the old one. Check public reachability from an independent authorized client.
[Ubuntu OpenSSH guidance](https://documentation.ubuntu.com/server/how-to/security/openssh-server/).

OS security updates/reboot are a separate full-host maintenance window: check
`/var/run/reboot-required`, pending packages/kernel and console access; take accepted independent
backups; quiesce producers and workers; record stopped/recovery services and restart policy; patch
approved packages; reboot only after approval. A reboot necessarily interrupts both sites on one VPS.
Afterwards require filesystem/clock/Docker health, data services, edge, both TLS/auth boundaries,
worker queues and backup timers/alerts. If recovery fails, keep university ingress closed, use the
console and approved kernel/recovery plan, preserve evidence and never delete volumes to force startup.

Use existing lightweight host/systemd monitoring rather than adding a large monitoring stack here.
Assign alert delivery/escalation owners and test an actual alert before launch. Track host reserve,
CPU/steal, disk/inodes/IO, container OOM/restarts, each API/web/DB/Redis/MinIO, queue age/failures,
TLS expiry/renewal, anonymous reviewer denial, backup upload age/integrity and last isolated restore.
Proxy liveness alone is insufficient. Restrict metrics/log access, rotate logs, and redact all secrets,
cookies, activation codes and student values. Monitoring/delivery/backup timers are not installed by
this offline branch and remain acceptance requirements.

## Verification and launch gates

Local results and limitations are in [the engineering verification report](shared-proxy-verification.md).
No current VPS/deployed release, real DB emptiness/migrations, public HTTPS uptime, load capacity, off-site recovery,
staff login or student import is claimed verified. Approval requires the new reviewed immutable release,
pinned Caddy CI/runtime checks, synthetic concurrent UAT, safe resource acceptance, host/SSH/reboot/alert
review, off-server restore acceptance and the institutional inputs in the [fast-track launch packet](university-fast-track-launch.md).
