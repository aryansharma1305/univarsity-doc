# Shared-proxy authentication performance and acceptance

PR #34 merged at `cadc64411ec3d4d38d3786bc4040155de101f421`. This follow-up changes only
resource preparation and synthetic verification. No Hostinger, DNS or payment operation is included.
The deployment remains blocked on review, exact-source CI and an authorized host acceptance rehearsal.

## Cause and proposed allocation

The pinned Caddy v2.11.7 runs bcrypt cost 14 on the first correct reviewer password after a restart.
A minimal reproduction at 0.1 CPU took **16.284 seconds cold versus 0.006 seconds warm**, consuming
1.645 CPU-seconds and being throttled in 164/165 CFS periods (16.172 throttled seconds). The university
TLS/backend control was 0.085 seconds. Changing only the hard CPU quota shortened cold authentication
approximately inversely with the quota. This identifies CPU throttling of bcrypt as the principal cause.

The Caddyfile adapter enables the existing native authentication cache by default; valid cache hits
avoid repeating the hash. Its implementation also coalesces simultaneous identical computations.
No cache, bcrypt, gate matcher, session, CSRF, RBAC or rate-limit setting is changed here. An incorrect
password and an anonymous request must still fail after load; TLS SNI/Host mismatch must return 421.
See the pinned [Caddyfile adapter](https://github.com/caddyserver/caddy/blob/v2.11.7/modules/caddyhttp/caddyauth/caddyfile.go)
and [Basic Auth implementation](https://github.com/caddyserver/caddy/blob/v2.11.7/modules/caddyhttp/caddyauth/basicauth.go).

Proposed edge ceiling: **1.0 CPU, 128 MiB, no container swap, 4096 CPU shares**. Shares give a short
bcrypt burst priority against the applications' aggregate 3840 shares (six university services at
512 plus six staging services at 128); they do not reserve idle CPU. University ceilings total
0.53 CPU, staging 0.27, so steady ceilings sum to 1.8 CPU. Operator jobs have 0.10 CPU and 512 MiB;
quiesce the corresponding writers for capture/migration/restore and run only one job at a time.
The [service budget](shared-proxy-coexistence.md#measured-inputs-and-provisional-budget) contains the memory
allowances and maintenance constraints. These limits trade batch throughput for authentication
responsiveness and require the full-stack test and target-host approval.

## Thresholds declared before selection

Transport: cold reviewer p95 <=2 s and p99 <=3 s; warm requests on **each site** p95 <=250 ms and
p99 <=500 ms; >=20 requests/second; zero errors, timeouts or OOM kills; edge peak <=96 MiB within
its 128-MiB cap. Contended cold authentication must meet the same two/three-second thresholds.

Application: each site's page/API p95 <=2 s, p99 <=3 s; zero errors/timeouts/OOM; summed server
CPU usage <=1.6 cores average; conservative sum of each container's lifetime peak <=6144 MiB;
58-row import <=120 s and each photo submission/approval/read <=10 s. A functional-only emulation
run cannot accept capacity even if its timings happen to meet these thresholds.

## Repeatable workload and evidence

`runtime_regression.py --benchmark` tests 0.1/0.25/0.5/1.0 CPU against the same pinned binary and
unchanged production gate/policy, five cold restarts each and a 60-second mixed load for each.
Ten clients (two reviewers, eight university) think 100 ms between requests, opening a new verified
TLS HTTP/1.1 connection each time. Internal test TLS replaces ACME; synthetic HTTP upstreams replace
applications. Servers are pinned to CPUs 0,1. Clients/Docker/host processes are outside that envelope;
this is a controlled two-CPU service envelope, not a simulation of host CPU steal, IO or the OS.
Percentiles use nearest rank. Five cold samples make p95/p99 the observed maximum, not a reliable
population-tail estimate. Raw per-request samples, cgroup CPU-seconds/throttling/peak RAM/OOM and engine
metadata are retained in `test-results/coexist-benchmark.json`.

Initial local matrix, native ARM Caddy on Docker Desktop (10-CPU/7.75-GiB VM; server cpuset 0,1):

| CPU  | Cold p50 / p95 / p99 s   | Warm reviewer p50 / p95 / p99 s | HTTPS RPS | Edge mean cores / peak MiB |
| ---- | ------------------------ | ------------------------------- | --------- | -------------------------- |
| 0.1  | 17.101 / 18.813 / 18.813 | .0076 / .0921 / .1635           | 78.22     | .0938 / 20.17              |
| 0.25 | 6.042 / 6.272 / 6.272    | .0108 / .0178 / .0240           | 87.80     | .0872 / 22.32              |
| 0.5  | 2.981 / 2.993 / 2.993    | .0109 / .0180 / .0256           | 84.83     | .1091 / 22.91              |
| 1.0  | 1.535 / 1.544 / 1.544    | .0094 / .0192 / .0470           | 88.33     | .1006 / 23.09              |

All four 60-second phases had zero errors/timeouts/OOM. University warm p95/p99 were respectively
.0920/.1654, .0176/.0229, .0183/.0351 and .0187/.0446 seconds. Only 1.0 CPU met the declared cold goal.
The first 1.0-CPU contention attempt with default shares missed the two-second cold-p95 gate and
was rejected. This motivated the explicit scheduling weight; single samples are not acceptance.
The first weighted local trial also failed: contended cold p50/p95/p99 were 2.586/3.430/3.430 s.
A host knowledge-graph refresh overlapped that trial, so host scheduling was not controlled; the
failure is retained and cannot establish acceptance or disprove the proposed target-host allocation.
Repeat with other local CPU work idle and use the native exact-source CI evidence. Keep failed
evidence rather than presenting only successful runs.

An idle-host repeat still missed cold p95: two simultaneous reviewers across five restarts measured
p50/p95/p99 **1.762/2.730/2.730 s**. Single-client cold p50/p95/p99 were 1.822/1.991/1.991 s;
warm reviewer p50/p95/p99 were .0043/.0107/.0200 s at 92.59 RPS. This keeps local contention acceptance
open; do not attribute the earlier failure solely to graph work or claim the weight guarantees a pass.

Proxy benchmarking runs on a separate native runner in parallel with image production, so its
acceptance is independent of application-image build timing.

The first follow-up CI transport run exposed a connection-close race during USR1 listener reload.
The rehearsal now polls for the expected response within the original 15-second transition window,
retrying a transient connection close only during reload/rollback. Load errors/timeouts remain failures.

The selected configuration then runs five cold restarts with two simultaneous reviewers and two
0.4-CPU busy competitors (1920 shares each) pinned to the same two CPUs, 60 seconds of contended
mixed load, and 180 seconds of uncontented soak. `--benchmark-selected` repeats only this selection.
The complete native AMD64 matrix and weighted contention must pass in CI on the exact pushed SHA.

`full_stack.py` runs the CI-produced immutable AMD64 API/worker/web/tools image IDs from the same SHA
on a fresh GitHub-hosted AMD64 runner. It creates two new private projects, generated secrets, six
synthetic staff accounts, four synthetic registrations, independent DB/object canaries and a generated
58-row workbook. The staging stand-in uses the fresh clean model with staging limits and the original `web` alias;
the existing staging CI job separately tests the original launcher. This does not adopt or read
`docversity14h`. Neither application publishes ports. Only the test edge publishes loopback HTTPS;
a test-only listener bridge compensates for Docker Desktop internal-network port suppression.
All application/data services and Caddy are pinned to CPUs 0,1 with the proposed individual limits.

It verifies secure host-only cookies, staff/student separation, CSRF/origin refusal, RBAC, activation,
missing reviewer authentication on four route classes, foreign cookies and foreign PostgreSQL/Redis/
MinIO credentials in both directions. For 120 seconds, two staging and eight university clients mix
HTML/API requests with one-second think time while a 58-row import and two independent synthetic
DOB/photo submissions/approvals execute. It verifies staging maintenance leaves university and the
edge untouched; stopping the shared listener and returning to the original listener must restore
protected staging with the same application/data container IDs and authenticated session.
Raw load/resource aggregates are retained in `test-results/coexist-full-stack.json`.

Local AMD64 application emulation on ARM has not established a full-stack pass: startup/health was
slow and worker startup did not complete within the rehearsal timeout. The local `--functional-only`
mode explicitly records its CPU floor/health-timeout adjustments and never certifies capacity.
Native CI is required; do not label an emulation failure as a production capacity result.

## Native AMD64 CI observation

On initial follow-up SHA `42bdd06`, the independent AMD64 runner measured cold p95 at 7.321 s
(0.1 CPU), 2.992 s (0.25), 1.482 s (0.5) and 0.804 s (1.0). The 1.0-CPU configuration's warm
reviewer p50/p95/p99 were .0429/.0446/.0474 s at 69.85 RPS, mean .0421 CPU cores, peak 18.91 MiB,
zero errors/timeouts/OOM. Contended cold p50/p95/p99 were .7951/.8054/.8054 s. The complete transport
matrix/contention/soak passed. Faster AMD64 hardware lets 0.5 CPU pass the simple cold phase;
1.0 CPU is proposed for cold-burst margin and is the allocation exercised by the contended and
application acceptance tests. This is not a claim that 1.0 is optimal on the unmeasured VPS.

The same SHA's full-stack attempt stopped before startup because the fresh load runner did not
have the pinned infrastructure images. CI now explicitly pulls all four pinned AMD64 infrastructure
images before starting the two private projects; application images still come only from that run's
exact-source archive. This setup failure is not a full-stack performance result. Exact final-SHA
CI must pass again after the rehearsal fixes.

## Operator acceptance and release boundary

The independent proxy CI job retains `shared-proxy-benchmark-<SHA>`; the image-dependent application
job retains `shared-proxy-load-<SHA>` and creates `docversity-linux-amd64-<SHA>` only from
that source; the load job downloads/checks its SHA256SUMS, verifies all four loaded image IDs, then
uses those exact IDs. Never reuse PR #34's earlier image archive for a later source commit.
CI results and immutable artifact links belong in the follow-up PR and final handover.

After review and explicit Hostinger authorization, follow the existing [handoff and rollback
sequence](shared-proxy-coexistence.md) with a fresh verified staging backup and rollback container.
Run the longer stepped workload there: five-minute warmup, 15 minutes per agreed concurrency step,
60-minute peak soak, simultaneous reviewers, import/photo/PDF peaks, backups and controlled rollback.
Measure cold/warm p50/p95/p99, errors/timeouts, CPU/steal, RAM available, swap, IO, every container's
peak/OOM/restarts, queue age and backup duration. Preserve >=20% available RAM, <=75% sustained host
CPU, zero auth/isolation failures and OOM/restarts; stop on breaches. Confirm workload/latency goals
with the mentor before testing. CPU limits are upper bounds, not guaranteed host time.

No VPS acceptance, real off-server backup/independent restore, SSH/reboot/MFA/alert-delivery validation,
public DNS/ACME or university data/staff approval has occurred. Real launch readiness remains blocked
until these gates pass. Do not import real records, activate payments or merge/deploy automatically.
