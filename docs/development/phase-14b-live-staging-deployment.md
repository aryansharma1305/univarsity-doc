# Phase 14B — Full-stack live staging for university review

Status: **locally tested staging verified** (production mode, isolated `docversity14b`, base
`828e096`). It is ready for an authorized internet-hosted deployment. **Externally deployed
staging: not started.** Nothing is provisioned, purchased, deployed or exposed, and no reviewer
credential has been issued.

## Baseline (22 October 2026)

- Worktree `docversity-phase14b`, branch `feature/phase-14b-live-staging`.
  - Created from `origin/main` at `2dce801` (PR #25, Phase 12C.1).
  - Fast-forwarded with the uncommitted Phase 14B work intact to `828e096` (PR #26, UI-04 merged
    at 10:15 UTC). None of main's changed files overlapped Phase 14B's files.
  - Main CI on `828e096` was still in progress at integration; `2dce801` is green.
- **Phase 12C.1:** merged (PR #25).
- **UI-04:** merged (PR #26).
  - `/` is now the verification homepage, with four services each "Not available yet" and no
    forms. `/verify` redirects to `/` (307).
  - The staging smoke test, the release manifest and the walkthrough have been updated for it.
  - UI-04 changes no API.
- **Vercel:** no Vercel project, configuration or CLI exists in the repository or on this machine.
  Phase 13A lists Vercel/Hostinger deployment as out of scope. Nothing was changed.

## What Phase 14A already provides (reused, not rebuilt)

`deploy/` contains a production-mode Docker stack verified locally and on Linux/AMD64 CI:

```text
127.0.0.1:3443 → Caddy → Next.js (standalone) → NestJS API → PostgreSQL 17 / Redis 7.4 / MinIO
                                                     ↑
                                              BullMQ worker
```

- Only Caddy publishes a port. Backend services sit on an internal Docker network.
- Separate bootstrap, migration-owner and runtime database roles. The runtime role cannot create
  schema, roles or databases.
- A bucket-scoped MinIO application user, and a Redis ACL user confined to `staging:*`.
- Non-root, read-only containers with dropped capabilities and memory/PID limits.
- Runtime secrets are injected from files and never baked into images.
- Secure `__Host-` cookies, an exact CORS origin, CSRF, Swagger off, and log redaction.
- A consistent backup (writers stopped) and a restore rehearsal that compares fingerprints.
- `Caddyfile.production` prepares automatic HTTPS for a real domain; it has never been loaded.
- The Phase 14A gaps 14B must close:
  - **Synthetic data:** only one admin and one student exist.
  - **Reviewer access:** no access gate for reviewers.
  - **Public-host configuration:** no production override or public-host runbook.
  - **Browser smoke tests:** none run through the staging proxy.
  - **Hosting:** no host decision has been made.

## Deployment architecture (proposed)

```text
Reviewer browser
   │ HTTPS 443 (HTTP 80 → redirect, ACME only)
   ▼
┌──────────────── Ubuntu 24.04 LTS VPS (staging only) ─────────────────┐
│ UFW: 22 from admin IPs, 80/443 public; nothing else                  │
│                                                                      │
│  Caddy (Let's Encrypt, HSTS, reviewer gate, noindex, rate limits)    │
│    │ edge network                                                    │
│    ▼                                                                 │
│  Next.js standalone ──► NestJS API ──► PostgreSQL (docversity_staging)│
│                           │   │   └──► Redis (ACL user, staging:*)   │
│                           │   └──────► MinIO (private bucket)        │
│                           ▼                                          │
│                     BullMQ worker  (backend network: internal only)  │
│                                                                      │
│  Operator-only: migrate, fixtures, backup → encrypted off-host copy  │
└──────────────────────────────────────────────────────────────────────┘
```

- **One host, the same Compose stack.** Phase 14A's `compose.yml` is the base; a reviewed
  `compose.staging-public.yml` override:
  - publishes Caddy on 80/443;
  - loads a public staging Caddyfile;
  - sets the exact HTTPS `WEB_URL`/`CORS_ORIGINS`.

  No other topology change is made, so `TRUST_PROXY=2` (Caddy → Next → API) stays valid.

- **Reviewer gate, two layers:**
  - **Edge:** Caddy basic authentication with one shared reviewer credential, plus
    `X-Robots-Tag: noindex` and `robots.txt` disallow. Unauthenticated internet traffic never
    reaches the application.
  - **Application:** separate least-privilege synthetic accounts for each reviewer role.
- **Images are built off the host** (in CI or locally for `linux/amd64`) and pushed to a private
  registry by digest. They can also be built on the VPS if it has 8 GB RAM. Building with 4 GB is
  likely to fail, because Next and Chromium image builds are memory-heavy.
- **Data:** only generated synthetic data. No dump, workbook or object from any local database is
  copied.

## Hosting assessment

The workload is the same on every option. It needs:

- **Seven long-running containers.** They use about 640 MiB at rest (Phase 14A measurement). The
  Compose memory limits sum to about 4.4 GiB at worst.
- **Chromium inside the API** for synthetic PDF previews. This is the memory spike risk.
- **Disk:**
  - Images: about 4–5 GB with shared layers.
  - PostgreSQL, objects and backups: under 5 GB for synthetic staging.
  - Headroom for upgrades.

| Option                                                     | Fit                                                                                                                                                  | Approx. cost (list, excl. tax)                                       | Operational load                                                                            |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Hostinger KVM 2** (2 vCPU, 8 GB, 100 GB NVMe, 8 TB)      | Runs the verified stack unchanged; room for Chromium and an on-host build                                                                            | $8.79/mo promotional, paid upfront for the term; renews at $14.99/mo | You own OS patching, firewall, backups and monitoring; weekly provider backups are included |
| Hostinger KVM 1 (1 vCPU, 4 GB, 50 GB)                      | Possible only with off-host builds; little headroom for Chromium plus PostgreSQL                                                                     | $6.49/mo promotional; renews at $11.99/mo                            | Same as above, with more tuning risk                                                        |
| Hostinger KVM 4 (4 vCPU, 16 GB, 200 GB)                    | Comfortable; more than a review demo needs                                                                                                           | $12.99/mo promotional; renews at $28.99/mo                           | Same as KVM 2                                                                               |
| DigitalOcean Basic 4 vCPU / 8 GB (Bangalore region exists) | Same fit as KVM 2; hourly billing, so it can be deleted after the review                                                                             | about $48/mo                                                         | Same as KVM 2; snapshots cost extra                                                         |
| Hetzner CPX32 (4 vCPU, 8 GB)                               | Same fit; prices rose sharply in June 2026; EU/US/SG only                                                                                            | about €35/mo (DE/FI)                                                 | Same as KVM 2                                                                               |
| PaaS (Render/Railway) + Vercel for the frontend            | Needs four services plus managed PostgreSQL/Redis plus S3; Chromium needs a Docker service; a split origin breaks the same-origin CSRF/cookie design | Usage-based; typically $40–100+/mo for this shape                    | Less OS work, but the security model would have to be redesigned and re-verified            |

**Recommendation: a dedicated Hostinger KVM 2 VPS used only for staging.**

- **Why:**
  - It runs the exact stack already verified in Phase 14A and on Linux/AMD64 CI.
  - 8 GB covers Chromium PDF rendering and an emergency on-host build.
  - It's the lowest cost that doesn't need architecture changes.
  - It matches the Ubuntu VPS runbook Phase 14A already prepared.
- **Caveats to confirm at purchase:**
  - Promotional pricing requires paying the full term upfront.
  - The data-centre list (India availability) wasn't visible on the pricing page.
  - Whether prices include tax wasn't stated.
- **If a short paid commitment matters more than monthly price:** DigitalOcean bills by the hour,
  and a droplet can be deleted after the review window.
- **Rejected:**
  - **Vercel or a PaaS split:** it would break the same-origin cookie, CSRF and trusted-proxy model,
    which would have to be redesigned and re-verified.
  - **KVM 1:** too little headroom for Chromium plus PostgreSQL.

Prices were checked on 22 October 2026 (the Hostinger pricing page, and third-party summaries for the
others) and change often. Confirm them on the vendor's page before purchase.

## Staging release manifest (draft)

Status key:

- **E2E:** works end to end with synthetic data.
- **Preview:** layout or sample only.
- **Gated:** server-blocked until a university decision.
- **Absent:** not built.

| Area                                                                 | Status       | Reviewer can                                                                                      |
| -------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------- |
| Public verification homepage (UI-04) and service selection           | E2E          | Browse the four services; each says "Not available yet"; no forms; portal links                   |
| Public verification (`/verify/*`, `/results`)                        | Gated        | See honest "not available yet" pages; no request is sent                                          |
| Staff login, dashboard, RBAC                                         | E2E          | Sign in per role; see only permitted navigation                                                   |
| Departments, courses, sessions, subjects, curricula                  | E2E          | Create/edit synthetic masters, version and activate curricula, assign students                    |
| Students and registrations                                           | E2E          | Manage synthetic students/registrations                                                           |
| Excel student import (worker)                                        | E2E          | Upload a generated synthetic workbook → map → validate → commit                                   |
| Student accounts and activation                                      | E2E          | Issue activation codes; activate a synthetic student                                              |
| Student portal (dashboard, course, profile, documents)               | E2E          | Sign in as a synthetic student; propose profile changes                                           |
| Profile change requests (staff review)                               | E2E          | Approve/reject synthetic requests                                                                 |
| Historical documents                                                 | E2E          | Upload/publish synthetic PDFs; the student sees published copies                                  |
| Examinations, external links, re-exam applications                   | E2E          | Manage records; a student applies; staff decide                                                   |
| Re-exam payments                                                     | Gated        | Configure synthetic destinations; **no live payment**; verification of a submitted reference only |
| Draft results, result import preview, internal review                | Partial      | Enter/import draft marks; review/approval is blocked by policy; **publication disabled**          |
| Student results                                                      | Gated        | Honest unavailable state; no unpublished results shown                                            |
| Certificate requests (12B)                                           | Partial      | Submit/review requests; no approval, issuance or signing                                          |
| Certificate templates and synthetic previews (12A/12C)               | Preview      | Staff preview SAMPLE PDFs                                                                         |
| Course certificate eligibility (12C)                                 | Gated        | Propose a set; approval disabled until the university names an approver                           |
| Student sample PDFs (UI-05 training; 12C.1 academic)                 | Preview      | Training sample always; academic samples only for APPROVED sets, so **none on staging**           |
| Health endpoints, queue round-trip                                   | E2E          | `/health`; worker health is operator-only                                                         |
| Email delivery, password reset                                       | Absent       | Reset returns 503; recovery uses a new activation code                                            |
| Rector approval, signing, official issuance, QR, public verification | Absent/Gated | Not available                                                                                     |

Rows marked E2E are confirmed by the browser smoke tests in Step 5 before release. Academic sample
PDFs need an approved course set. Production code keeps approval disabled, and 14B adds no bypass,
so staging will show the explanations only. That matches what real students would see today.

## Decisions recorded (22 October 2026)

| Decision                 | Choice                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------- |
| Hosting                  | Hostinger KVM 2 (2 vCPU, 8 GB, 100 GB NVMe). Purchase needs separate authorization. |
| Disk space               | Freed by the project owner (no Docker prune by Claude).                             |
| University administrator | `SUPER_ADMIN` on synthetic staging only.                                            |
| Reviewer gate            | Caddy basic auth.                                                                   |
| Domain                   | Not chosen. DNS is changed only after separate approval.                            |

## Implementation (Steps 3–4)

### Isolation

- `deploy/compose.yml` takes its project and image names from `STAGING_PROJECT`, with a default of
  `docversity14a`. Phase 14A's running stack, its CI job and its image tags are unchanged.
- `init-local.py` accepts `--project docversity14<letter>`, `--https-port` and, for an authorized
  host only, `--public-origin` with `--acme-email`. It validates them before writing anything, and
  writes `instance.json` next to the secrets.
- `staging.py` reads `instance.json`. Every Compose call uses that project, port and overlays. The
  restore project is `<project>-restore`.
- 14B runs locally as `docversity14b` on `https://localhost:3444`, with its own volumes and secrets
  directory (`docversity-phase14b/.local/staging`). It never touches the `docversity`,
  `docversity14a*`, QA or other worktrees' volumes.
- The worktree's development `.env` (used only for lint and typecheck) points at
  `docversity_phase14b`, a separate bucket and separate queue/Redis prefixes. It can never address the
  original development database.

### Reviewer gate and public overlay

- `deploy/review-site.caddy`, shared by the local and public Caddyfiles:
  - Every path except `/robots.txt` requires the reviewer gate (`basic_auth @gated`) before any
    request reaches Next.js or the API.
  - `X-Robots-Tag: noindex, nofollow, noarchive`, `Referrer-Policy: same-origin`, the `Server`
    header removed, and the existing 12 MB request-body limit.
  - `/robots.txt` disallows everything.
- `/health` is behind the gate, because it reports dependency status. Compose's proxy healthcheck
  uses a container-internal listener (`:8081`, never published) that forwards only `/health`.
  External uptime monitoring needs the gate credentials.
- `staging.py review-init` hashes the gate password with the pinned Caddy image's bcrypt
  (`caddy hash-password`, password on stdin, no network). It writes
  `.local/staging/review_gate.caddy` (0444) as a `reviewer_gate` snippet holding one bcrypt user,
  and refuses to overwrite it. The plaintext never appears in argv, logs or the repository.
- `compose.review.yml` mounts the gate, the shared site and the local `Caddyfile.review` (Caddy's
  internal CA, loopback port only). All three are read-only binds with `create_host_path: false`.
- The gate fails closed at four independent layers. See
  [Reviewer gate: fail-closed startup](#reviewer-gate-fail-closed-startup).
- `compose.public.yml` is applied only when `init-local.py` was given `--public-origin`, and
  `staging.py` refuses it without the gate. It:
  - replaces the loopback port with 80/443;
  - loads `Caddyfile.review-public` (Let's Encrypt, automatic HTTP→HTTPS redirect, HSTS);
  - passes the domain and ACME email from `instance.json`.

  Nothing else is published. `TRUST_PROXY=2` stays correct (Caddy → Next → API).

- **Rate limiting:** the stock Caddy image has no rate-limit module. The application's existing
  login, activation, sample and verification limits apply behind the gate; no extra plugin is built.

### Synthetic review data (`staging.py review-fixture`)

`deploy/scripts/review-fixture.mjs`:

- **Guards:** runs only against `postgres/docversity_staging`; refuses if review data exists or any
  non-SYNTHETIC student is present.
- **Staff reviewers:**

  | Reviewer                 | Role          | Email                              |
  | ------------------------ | ------------- | ---------------------------------- |
  | University administrator | `SUPER_ADMIN` | `review.admin@example.invalid`     |
  | Registrar/staff          | `REGISTRAR`   | `review.registrar@example.invalid` |
  | Examination staff        | `EXAM_ADMIN`  | `review.exams@example.invalid`     |

- **Student reviewer:** "SYNTHETIC Asha Reviewer", activated, with three registrations:
  - `REVIEW-REG-1001`: 3-year BSc;
  - `REVIEW-REG-1002`: 3-month certificate course;
  - `REVIEW-REG-1003`: 1-year diploma (shows the unresolved 12-month policy).
- **Students without accounts:** six more, for the activation-code and record-management walkthrough.
- **Masters:** two SYNTHETIC departments, one active session, four courses (3 years
  semester-wise, 2 years year-wise, 3 months, 1 year) and five catalogue subjects.
- **Not seeded:** curricula, examinations, results, certificate sets, requests, payments and
  historical documents. Reviewers create these through the application, so every server rule,
  separation-of-duties check and policy gate applies.
- **Not written directly:** no approved, published, issued or paid state.
- **Passwords:** random (≥32 characters), generated by `init-local.py` into
  `.local/staging/reviewers.json`. They are never printed, committed or put in images.

### Configuration and safety checks

- `check-config.py` adds assertions for both overlays:
  - the project name;
  - the gate mounted in every overlay;
  - the backend network internal;
  - no service except Caddy publishes a port;
  - loopback 3443 only for review, and exactly 80/443 for public;
  - `robots.txt` exempt and `noindex` set;
  - no `tls internal` in the public Caddyfile.
- `test_staging.py` has 9 tests (7 existing plus 2 new):
  - invalid project names, privileged ports and malformed public origins are refused before any
    secret is written;
  - a public origin without an ACME email is refused;
  - a review instance gets its own origin and three least-privilege staff roles;
  - all five passwords are distinct and ≥32 characters;
  - nothing secret is printed.
- `smoke.mjs` (Phase 14A's HTTP-level checks) now reads the origin from `WEB_URL` and sends the gate
  credentials when the gate exists. It uses system trust when no local CA is configured (a public
  host).
- `verify-restore.mjs` checks for the base fixture and that every restored student is SYNTHETIC,
  instead of exactly one student.

### Browser smoke suite (`pnpm --filter @docversity/web test:staging`)

`apps/web/playwright.staging.config.ts` and `apps/web/e2e-staging/staging.spec.ts` run against a
**running** stack through the gate, on desktop Chrome and Pixel 7 (Chromium):

- **TLS:** Chromium pins only the stack's own Caddy intermediate key
  (`--ignore-certificate-errors-spki-list`). Node-side API calls trust the local root through
  `NODE_EXTRA_CA_CERTS`, for that process only. TLS validation is never disabled, and the host
  trust store is unchanged.
- **Tests:**
  1. **Gate:** anonymous and wrong-password requests get 401 on `/`, `/health`, both login pages
     and the API; `/robots.txt` disallows everything.
  2. **Public:** the homepage (with `noindex`) and `/verify` load; all four public verification
     endpoints return `UNAVAILABLE`; `/admin` and `/student` redirect to their logins; protected
     APIs return 401; Swagger returns 404.
  3. **Student:** login → dashboard → course → documents; the training sample PDF downloads with
     `no-store`; no `APPROVED_FOR_COURSE` type exists and the academic sample endpoint returns 404;
     staff APIs reject the student session; the results page shows its honest state.
  4. **Registrar:** dashboard, course list, student list, a registrations search and a synthetic
     department write (CSRF, audit). Creating an examination is refused (403), as is publishing
     (403). Student APIs reject the staff session.
  5. **Examination staff:** the examinations and results workspaces load. Writing a student is
     refused (403), as is publishing (403).
  6. **Administrator:** every module page loads. Publishing returns 409 (blocked by policy), and
     approving a course certificate set is refused.

## Reviewer gate: fail-closed startup

A 14B instance or a public instance must never start with the reviewer gate missing, invalid or
wrongly referenced. Only Phase 14A's original loopback stack and its CI job are exempt
(`gate_required`). Four independent layers enforce this.

| Layer               | Mechanism                                                                                                                                                                                                                                                     | Refuses                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. `staging.py`     | `require_gate()` runs before every action except `review-init`, `stop`, `status` and `build`, and inside `up()` and `backup()`. The gate must be a regular, non-symlink, read-only file that exactly matches the `reviewer_gate` snippet with one bcrypt user | Missing, symlinked, writable, empty, unwrapped, misnamed, plaintext, empty-snippet, extra-directive and second-user gates. Nothing is started or stopped |
| 2. Compose          | The proxy's Caddy files are read-only binds with `create_host_path: false`                                                                                                                                                                                    | A missing gate file, instead of silently mounting an empty directory                                                                                     |
| 3. Caddy            | The Caddyfiles import the gate file at top level. The shared site then uses `import reviewer_gate`, a snippet only the gate file defines. `admin off` makes runtime reloads impossible                                                                        | Missing, empty, unwrapped, misnamed or plaintext gates: Caddy exits 1 before listening                                                                   |
| 4. Post-start probe | `up()` (and therefore `backup`) runs `gate-check.mjs` inside the backend network after every start: 11 route classes × anonymous, wrong password and wrong user must get 401; `robots.txt` 200; the reviewer is admitted                                      | Any other answer stops the proxy, the only published service, and exits non-zero                                                                         |

Configuration reload: Caddy's admin API is off in both Caddyfiles (asserted), so the only way to
change the configuration is to recreate the container, which is exactly the startup path tested
below.

### Regression evidence

- **`deploy/scripts/test_staging.py`:** 13 tests passed, 4 of them new for the gate:
  - every unsafe gate variant is rejected;
  - `up()` and `backup()` refuse a missing gate before any Docker call, with no backup directory
    created;
  - review and public instances always require the gate;
  - a failed post-start probe stops the proxy.
- **`deploy/scripts/gate_regression.py`** (live Docker; also added to the CI staging job). It uses
  the pinned Caddy image with the **real** `Caddyfile.review` and `review-site.caddy`, on a throwaway
  loopback port, and polls every 50 ms from container start. It exited 0:

  | Gate variant             | `staging.py` validator | Caddy         | Anonymous answers during startup                                                              |
  | ------------------------ | ---------------------- | ------------- | --------------------------------------------------------------------------------------------- |
  | valid                    | accepted               | running       | **only 401**; reviewer admitted; wrong password 401; `robots.txt` 200; runtime reload refused |
  | missing                  | refused                | exit 1        | none (never listened)                                                                         |
  | empty                    | refused                | exit 1        | none                                                                                          |
  | unwrapped (draft format) | refused                | exit 1        | none                                                                                          |
  | misnamed snippet         | refused                | exit 1        | none                                                                                          |
  | plaintext password       | refused                | exit 1        | none                                                                                          |
  | empty snippet            | refused                | running (502) | Caddy alone can't detect this; layers 1 and 4 refuse it                                       |

  Compose with the real overlay files and no gate file exited 1
  (`bind source path does not exist`), and no host path was created. The control with a gate file
  exited 0. No container or volume was left behind.

- **Live tests on the real 14B stack:**
  - **Missing gate:** `staging.py up` exited 1 ("Reviewer gate missing; refusing to start").
  - **Empty-snippet gate:** `up` exited 1, and so did `backup`.
  - In both refusals, no container started, nothing listened on 3444 and no backup directory was
    created. The real gate file was restored byte-identical.
  - **Cold start with a valid gate:** a host poller (TLS validated against the stack's own CA) sent
    927 anonymous requests across `/`, `/admin/login`, `/api/v1/auth/csrf`, `/health` and
    `/student/login` during `up`. 459 found nothing listening, 1 was a TLS handshake during bind,
    and **467 were 401**. The first HTTP response was 401, and there were 0 responses of 2xx or 3xx.
    The in-network probe then passed (33 refusals, reviewer admitted).
  - **Restart cycle** (`backup` stops and restarts the writers and proxy, then re-probes): 781
    anonymous requests. 325 not listening, 6 TLS handshakes during bind, **450 were 401**, and 0
    were served. The probe passed.
- The existing 14B gate file was converted in place to the snippet format, keeping the same user
  and bcrypt hash, so the reviewer password is unchanged.

## Verification evidence (testing window, 22 October 2026)

The work ran in a testing window given exclusively to Phase 14B. Codex's heavy work was paused.
Evidence logs are in `verification-baselines/phase14b/` outside the repository. Screenshots are in
[`phase-14b/`](phase-14b/).

### Environment

- 39 GB free disk at the start (25 GB at the end).
- Docker Desktop 29.6.1, an 8 GB VM, Linux/ARM64.
- The build cache was empty (pruned during the cleanup), so the images were built from scratch.

### Stack and gate

| Check                                            | Result                                                                                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Image build (`docversity14b-*`)                  | exit 0. Web 438 MB, worker 936 MB, API 2.16 GB, tools 2.02 GB (shared layers)                                                                  |
| `up` with migrations                             | exit 0. All migrations applied by the non-superuser owner. 7/7 services healthy                                                                |
| Published ports                                  | Only `docversity14b-proxy-1 443/tcp → 127.0.0.1:3444`. PostgreSQL, Redis, MinIO, API, worker and web have none                                 |
| Gate (host curl, local CA trusted)               | `/`, `/health`, `/admin/login`, `/api/v1/auth/csrf`: anonymous 401, wrong password 401, reviewer 200. `/robots.txt` 200 `Disallow: /`          |
| TLS                                              | System trust rejects the local CA (curl exit 60). The pinned CA verifies                                                                       |
| Headers                                          | Gated responses carry `X-Robots-Tag: noindex, nofollow, noarchive` and `Referrer-Policy: same-origin`, with no `Server` header                 |
| `/health` (gated)                                | `{"status":"ok","services":{"api":"ok","database":"ok","redis":"ok","storage":"ok"}}`                                                          |
| `staging.py smoke` (Phase 14A, through the gate) | exit 0: production cookies, staff/student isolation, CSRF, CORS, runtime DB role without DDL, Redis ACL, private storage, canary bucket denied |
| Resources at rest                                | About 545 MiB: API 248, worker 97, MinIO 78, web 63, PostgreSQL 39, Caddy 14, Redis 7 (MiB)                                                    |
| Secrets in logs                                  | 13 secrets and passwords checked against 1,474 log lines: 0 found                                                                              |

### Synthetic data

- `fixture` and `review-fixture` both exited 0.
- The staging database holds:
  - 8 students, all named `SYNTHETIC …`;
  - 10 registrations;
  - 5 courses;
  - 4 staff users.
- Roles:
  - `SUPER_ADMIN` ×2: the reviewer, plus Phase 14A's base staging admin, which is not distributed;
  - `REGISTRAR` ×1;
  - `EXAM_ADMIN` ×1.
- Each registrar smoke run adds one `REVIEW-SMOKE-*` SYNTHETIC department.

### Browser smoke suite (`test:staging`, desktop Chrome and Pixel 7)

**11 passed, 0 failed, 1 skipped.** The skip is by design: the gate test is an HTTP-level check and
runs once, on desktop.

Authorization boundaries confirmed:

- **Student:** login → dashboard → course → documents works, and the training sample PDF downloads
  (`no-store`). All three registrations show eligibility, with no `APPROVED_FOR_COURSE`; the academic
  sample endpoint returns 404. Staff APIs return 401 for the student session.
- **Registrar:** courses, students, registration search and a synthetic department write (201)
  work. Creating an examination returns 403, publishing returns 403, and student APIs return 401.
- **Examination staff:** the examinations and results workspaces load. Creating a student returns
  403, and publishing returns 403.
- **Administrator:** seven module pages load. Publishing returns **409 (blocked by university
  policy)**, and approving a certificate set is refused.
- **Public:** all four `/api/v1/public/verify/*` endpoints return `UNAVAILABLE`. `/admin` and
  `/student` redirect to their logins, protected APIs return 401, and Swagger returns 404.

No live payment, issuance, signing or Rector approval endpoint was activated. 14B changes no
application code.

Two of my own errors were found and fixed before these results:

1. `staging.py` checked for `review_gate.env` instead of `review_gate.caddy`. The first `up`
   therefore ran without the gate overlay (loopback only). The review fixture's guard caught it.
   After the fix, the proxy mounts the gate and every check above was re-run.
2. The registrar test's `.first()` matched the hidden desktop table on mobile. It now matches only
   visible elements.

Playwright's browsers had been removed by the disk cleanup and were reinstalled.

**Re-run after the fail-closed gate change:** `staging.py smoke` exited 0, and `test:staging` gave
11 passed, 0 failed, 1 skipped (by design). The screenshots in [`phase-14b/`](phase-14b/) are from
this run: 11 desktop and 11 mobile.

### Backup and restore

- `backup`: exit 0. A consistent dump (301 KB), an object mirror and a SHA-256 manifest were taken
  with the writers stopped. The stack restarted healthy.
- `restore-test 20261022T095045Z` into the fresh `docversity14b-restore` project: exit 0.
  - All 41 table fingerprints match.
  - Every object SHA-256 matches.
  - The restored data is readable with the limited runtime credentials.
  - Every restored student is SYNTHETIC.
- The recovery stack was stopped afterwards; its volumes are retained.
- A second backup, `20261022T102345Z`, exercised the stop → restart → gate re-probe path (exit 0).
  It wasn't restored, because the restore script deliberately refuses to reuse the existing
  `docversity14b-restore` volumes.
- Both backups are synthetic and stay in `docversity-phase14b/.local/backups` (0700). They are not
  yet copied off this machine; see the Phase 14A incident below.

### Repository gates (uncached, real exit codes)

| Gate                             | Exit | Result                   |
| -------------------------------- | ---- | ------------------------ |
| `pnpm install --frozen-lockfile` | 0    |                          |
| `pnpm format:check`              | 0    |                          |
| `pnpm lint --force`              | 0    | 18/18                    |
| `pnpm typecheck --force`         | 0    | 17/17                    |
| `pnpm build --force`             | 0    | 10/10                    |
| `pnpm db:check`                  | 0    | No difference detected   |
| `pnpm test --force`              | 0    | **916 passed**, 0 failed |
| `pnpm test:e2e`                  | 0    | **72 passed**, 9.2 min   |

The test harness's base database is this worktree's own `docversity_phase14b` (created in the
development PostgreSQL server, as every phase worktree has). The original `docversity` database was
never addressed.

Also passing:

- `test_staging.py` (13).
- `check-config.py` (Phase 14A and 14B assertion sets, including `create_host_path: false` and the
  snippet import order).
- `gate_regression.py`.
- `pnpm format:check` after the gate change.

### Preservation

| Data                                       | Result                                                                                                                                                                      |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original `docversity` database (38 tables) | Identical before and after, and identical to the 22 October baseline                                                                                                        |
| Development MinIO bucket (3,232 objects)   | Key, size and ETag identical before and after the window and across the gates                                                                                               |
| Phase 14A database (40 tables)             | Row counts and content fingerprints identical                                                                                                                               |
| Phase 14A MinIO volume                     | Object data byte-identical. Only MinIO's own `.minio.sys` usage/scanner metadata changed, written by the running Phase 14A container                                        |
| Phase 14A Redis volume                     | The AOF and RDB changed through BullMQ `staging:{imports,system}:stalled-check` writes by Phase 14A's own running worker. No 14B container mounts any 14A volume or network |
| Docker volumes                             | 0 removed. 7 added: `docversity14b_*` (5) and `docversity14b-restore_*` (2). The gate regression left none                                                                  |
| Re-check after the gate tests              | Original database, development MinIO bucket, Phase 14A database and Phase 14A MinIO object data all unchanged                                                               |

### Issues found outside this phase

- **Phase 14A's private data was lost when its worktree was removed during the disk cleanup. This
  is an outstanding operational recovery task.**
  Several other worktrees were removed too. This is documented as an infrastructure recovery issue
  in [phase-14a-local-data-recovery.md](phase-14a-local-data-recovery.md), which covers:
  - **lost:** 12 secret files, 2 backup entries and 45 evidence files;
  - **survives:** the volumes, and the runtime, worker and MinIO secrets in the memory of the running
    containers (key names verified);
  - the consequences;
  - a non-destructive recovery procedure. Credential resets are approval-gated, and nothing has been
    executed.
- **401 responses from the gate still carry `Server: Caddy`.** Caddy's own error responses don't
  pass through the `header` directive. This is minor and is noted for the public host.

## Hosting purchase and setup requirements (for the project owner)

Nothing below has been purchased or performed.

1. **Purchase:** Hostinger KVM 2.
   - Ubuntu 24.04 LTS, x86_64.
   - The nearest data centre to the reviewers. Confirm India availability at checkout.
   - A term that matches the review window. Promotional pricing is paid upfront; renewal is
     $14.99/mo.
2. **Provide to the operator (never in Git or chat):**
   - the VPS IP;
   - an operator SSH account using a public key;
   - access to the Hostinger recovery console.
3. **Domain:** choose a staging subdomain, e.g. `staging.<domain>`. After deployment approval, create
   A (and AAAA, if IPv6 is used) records pointing to the VPS. No other DNS changes.
4. **ACME email:** an operator mailbox for Let's Encrypt notices.
5. **Reviewer distribution:** who receives the gate credential and which application accounts, and
   through which private channel.
6. **Backups:**
   - an off-host encrypted destination (for example the university's storage or an S3-compatible
     bucket);
   - retention;
   - RPO/RTO for the review period.
7. **Owner** for OS updates, incidents and the end-of-review teardown date.

### Mandatory entrypoint: `staging.py` only

Every Phase 14B staging operation, locally and on any future host, **must** go through
`python3 deploy/scripts/staging.py`. That is the only path that enforces the reviewer gate:

- it validates the gate file before anything starts;
- it applies the gate and public overlays together;
- it runs the post-start gate probe, and stops the proxy if the probe fails.

The following are **prohibited** for a review or public instance, because each bypasses the
`staging.py` gate validation and the post-start probe:

- `docker compose up`, `start`, `restart`, `run` or `create` against `deploy/compose*.yml`;
- `docker run` of the proxy or Caddy image;
- `caddy run`, `caddy start` or `caddy reload`;
- editing or replacing the Caddyfiles or `review_gate.caddy` on a running host;
- removing `compose.review.yml` from the file set;
- publishing ports other than Caddy's.

Read-only inspection is allowed: `docker compose ps`, `logs` and `config`, and `docker stats`.

Release procedure:

1. Use only a reviewed, tagged commit.
2. Check out that commit, then run `init-local.py` and `staging.py review-init` once.
3. Run `staging.py build`, then `staging.py up`. The gate probe must print `PASS`; otherwise the
   proxy is already stopped.
4. Run `staging.py fixture`, `review-fixture` and `smoke`, then `test:staging` against the URL.
5. Run `staging.py backup`, which restarts through `up()` and re-runs the gate probe.

If anything fails, stop with `staging.py stop` and investigate. Never work around a refusal by
starting services directly.

**Deployment sequence** (after authorization; follows Phase 14A's runbook and the mandatory
entrypoint above):

1. Harden SSH, set up UFW (22 from admin IPs, 80/443) and install Docker from Docker's repository.
2. Check out the reviewed commit.
3. Run `init-local.py --project docversity14b --public-origin https://<domain> --acme-email <email>`.
4. Run `staging.py review-init`, then `staging.py build` (8 GB is enough) and `staging.py up`.
5. Run `staging.py fixture` and `staging.py review-fixture`.
6. Run the external checks against the public URL:
   - the `test:staging` smoke suite;
   - port scan: only 80/443 open;
   - TLS certificate and redirect;
   - gate.
7. Take a backup and rehearse a restore.

## Reviewer access (prepared, not issued)

- **Layer 1:** the gate credential (username `reviewer`), shared by all reviewers.
- **Layer 2:** one application account per reviewer role (table above). Every credential is in the
  host's private `.local/staging/reviewers.json`.
- Issuing credentials to university reviewers is an exposure decision that needs your approval. Use
  one private channel per reviewer; never email them together with the URL.
- Rotation: regenerate the gate (`review_gate.caddy`) and reset the application passwords after the
  review, or tear down the host.

## University walkthrough (per reviewer)

**Every reviewer:** open the staging URL and enter the gate credential. The UI-04 homepage shows the public
services. Verification is honestly unavailable.

**Student** (`REVIEW-REG-1001`):

1. Sign in at `/student/login`.
2. Dashboard → **Course** (the assigned curriculum appears once the registrar assigns one) →
   **Profile** (propose a correction) → **Documents**.
3. Preview and download the Training Certificate sample.
4. Under **Samples for your courses**, choose each course. Types appear as "Not currently approved
   for this course". The 1-year diploma explains that its policy is unresolved.
5. **Examinations** → apply for a re-exam once staff have configured an examination.
6. **Results**: honest unavailable state.

**Registrar** (`review.registrar@example.invalid`):

1. Courses → open the BSc → create a curriculum version, add subjects, activate it.
2. Students → assign the curriculum to `REVIEW-REG-1001`.
3. Student accounts → issue an activation code for a student without an account (the code is shown
   once).
4. Imports → download the template → fill in synthetic rows → upload → map → validate → commit.
5. Profile requests → review the student's proposal.
6. Historical documents → upload a synthetic PDF for a registration → publish → the student sees it.
7. Certificate eligibility → propose a set for a course. Approval stays disabled.

**Examination staff** (`review.exams@example.invalid`):

1. Examinations → configure the external application link (https) and create an examination for
   the activated curriculum.
2. Re-exam applications → decide the student's application.
3. Results → enter or import draft marks. Review and approval are blocked by policy; publication is
   disabled.

**University administrator** (`review.admin@example.invalid`):

1. Every module.
2. Settings → re-exam payment details. A second person must approve these (maker–checker); with one
   administrator account they stay unapproved.
3. Certificate templates → synthetic previews.
4. Users and roles.

## Per-module approval checklist (for the university)

For each module, the university records: reviewed by, date, approve / changes needed, and notes.

- Public homepage and verification messaging
- Student portal (dashboard, course, profile, documents, samples)
- Staff login, dashboard, roles
- Departments, courses, sessions, subjects, curricula
- Students, registrations, activation codes
- Excel student import
- Historical documents
- Examinations and re-exam applications
- Re-exam payment configuration (no live payments)
- Draft results and internal review
- Certificate requests, templates and eligibility
- **University decisions still required:**
  - the certificate-set approver;
  - result review/approval roles and publication policy;
  - the 12-month course policy;
  - Rector approval and signing;
  - payment accounts;
  - public verification activation.

## Security checklist

| Control                    | Status                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| HTTPS                      | Local: internal CA. Public: Let's Encrypt plus HSTS (prepared)                                   |
| Restricted reviewer access | Caddy basic auth on every path except robots.txt, fail-closed at 4 layers; per-role app accounts |
| Secure session cookies     | `__Host-`, Secure, HttpOnly, SameSite=Lax (smoke passed through the gate)                        |
| Trusted proxy              | `TRUST_PROXY=2`, unchanged topology                                                              |
| CSRF/CORS                  | Exact origin from `instance.json`; CSRF on unsafe methods                                        |
| Secret isolation           | Per-instance `.local/staging` (0700, files 0444); never in images or Git                         |
| Private networking         | Internal backend network; only Caddy published (asserted for both overlays)                      |
| Rate limiting              | Application limits (login, activation, samples, verification); no proxy limiter                  |
| Backup/restore             | Instance-aware; restore rehearsal passed (41 tables, all objects)                                |
| Log redaction              | JSON logger redaction; 13 secrets absent from 1,474 log lines                                    |
| Health monitoring          | `/health` behind the gate; internal healthcheck listener                                         |
| Application authorization  | Server-side RBAC; publication, approval, issuance, payments and verification stay disabled       |
| No development bypasses    | Production `NODE_ENV`, Swagger off, no seed commands in the release flow                         |

## Pre-delivery safeguards (22 October 2026)

- **Encrypted copy of Phase 14B's private data.** All 23 files of `.local` are copied: staging
  secrets, reviewer credentials, the gate file, the local CA and both synthetic backups.
  - **Format:** GnuPG symmetric AES-256 with SHA-512 iterated S2K, integrity-protected. The key is a
    random 256-bit passphrase held only in the macOS login Keychain. It is passed through stdin and a
    private file descriptor, never through argv or output.
  - **Location:** outside every worktree and outside the cleanup-swept project directory, at
    directory mode 0700 and file mode 0600. The exact location and the restore steps are recorded in
    a private note next to the archive, deliberately not in Git.
  - **Verification:**
    - the archive SHA-256 matches its record;
    - it decrypts in memory with the integrity check;
    - all 23 per-file SHA-256 values match the inner manifest, the external record and the live
      files.
  - **Negative tests:** a single flipped byte and a wrong passphrase are both refused.
  - **Not yet done:** there is no off-machine copy and no escrow of the Keychain key. Both need an
    owner decision.
- **Phase 14A:** its running containers and volumes were left untouched. Per the owner's instruction,
  no container was restarted, no credential extracted and no password or database user changed. The
  issue stays open as an operational recovery task in
  [phase-14a-local-data-recovery.md](phase-14a-local-data-recovery.md).
- **Gate regression, extended to the future VPS configuration** (`gate_regression.py`, 16 checks,
  exit 0):
  - Every invalid gate variant fails `caddy validate` for `Caddyfile.review-public` (run offline: no
    network, no ACME, no published port).
  - The valid VPS configuration adapts with authentication ahead of every reverse proxy on the public
    site (only `robots.txt` is exempt).
  - `compose.public.yml` refuses a missing gate file, a missing public Caddyfile and missing
    `PUBLIC_DOMAIN`/`ACME_EMAIL`, and creates no host paths.
  - The local checks from the earlier run all pass again.
- **Affected checks after the UI-04 integration:**
  - web lint and typecheck: 8/8;
  - web unit tests: 129 passed (25 files);
  - `test_staging.py`: 13 passed;
  - `check-config.py`: pass;
  - `pnpm format:check`: pass.
- **Graphify:** refreshed after the integration (7,437 nodes, 19,299 edges, 291 communities).
- **Preservation re-check:** all unchanged, and 0 volumes removed:
  - the original database (38 tables);
  - the development MinIO bucket (3,232 objects);
  - the Phase 14A database (40 tables);
  - the Phase 14A MinIO object data.

## Final testing window with UI-04 merged (22 October 2026)

The window was approved by the owner. Codex was not running heavy tests: no Playwright, Vitest,
build or extra containers were active. Free disk was 24 GB. Real exit codes:

| Step                                                             | Exit | Result                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `staging.py build` from `828e096`                                | 0    | All four images rebuilt. The web image contains the UI-04 `VerificationHome`                                                                                                                                                                                          |
| `staging.py up`, with an anonymous host poller from before start | 0    | 7/7 healthy; only Caddy published (`127.0.0.1:3444`). 1,027 anonymous requests: 573 not listening, 3 TLS handshakes during bind, **451 were 401**. The first HTTP response was 401; 0 were 2xx/3xx. The in-network gate probe passed (33 refusals, reviewer admitted) |
| `staging.py smoke`                                               | 0    | Trusted HTTPS, dependency health, production cookies and staff/student isolation, CSRF, CORS, runtime role without DDL, Redis ACL, private storage, canary bucket denied                                                                                              |
| `test:staging` (desktop Chrome and Pixel 7)                      | 0    | **11 passed, 0 failed, 1 skipped by design**                                                                                                                                                                                                                          |
| Academic sample gate (Phase 12C.1)                               | 0    | As the student reviewer: 3 registrations × 5 academic sample IDs = **15 × 404**. Eligibility labels are only `PENDING_COURSE_APPROVAL`, `NOT_OFFERED_FOR_COURSE` and `POLICY_UNRESOLVED`. The UI-05 training sample returns 200 `%PDF-`                               |
| Secrets in logs                                                  | —    | 14 secrets, including the gate hash, checked against 2,930 log lines: 0 found                                                                                                                                                                                         |
| `staging.py stop`                                                | 0    | Stack stopped; all 7 `docversity14b*` volumes kept                                                                                                                                                                                                                    |
| Preservation                                                     | 0    | Original database (38 tables), development MinIO bucket (3,232 objects), Phase 14A database (40 tables) and Phase 14A MinIO object data unchanged. Phase 14A containers untouched; 0 volumes removed                                                                  |

What the browser journeys confirm, on desktop and mobile:

- **UI-04 homepage:**
  - "Verify. Trust. Confirm." with four service tabs, each "Not available yet".
  - No form or input.
  - Student portal and staff access links.
  - `noindex`.
  - `/verify` redirects to `/` (307).
- **All four public verification APIs** return `UNAVAILABLE`.
- **Student:** dashboard → course → documents works, and the training sample downloads. No academic
  sample is served. Staff APIs return 401 for the student session.
- **Registrar:** courses, students and registrations work, with a synthetic write (201). Creating an
  examination returns 403, and publishing returns 403.
- **Examination staff:** the examinations and results workspaces load. Creating a student returns
  403, and publishing returns 403.
- **Administrator:** seven module pages load. Publishing returns 409 (university policy), and
  approving a certificate set is refused.
- **Anonymous:** `/admin` and `/student` redirect to their logins, protected APIs return 401, and
  Swagger returns 404.

One check had to be re-run. The first academic-sample probe sent 30 requests right after the browser
suite and hit the shared 30-per-minute sample rate limit (`429`, the correct behaviour). It was
discarded and re-run after the window reset with 15 requests: all 404.

The screenshots in [`phase-14b/`](phase-14b/) (11 desktop, 11 mobile) are from this run and show the
merged UI-04 homepage.

## Final architecture (as verified)

```text
Reviewer ──HTTPS──► Caddy (only published service)
                     │  local:  127.0.0.1:3444, internal CA        public: 80/443, Let's Encrypt, HSTS
                     │  reviewer_gate (bcrypt basic auth) on every path except /robots.txt
                     │  noindex · Referrer-Policy · no Server header · 12 MB body limit · admin off
                     │  :8081 internal-only /health for the Compose healthcheck
                     ▼ edge network
                  Next.js standalone ──► NestJS API ──► PostgreSQL 17 (docversity_staging; owner / app roles)
                                           │   │    └──► Redis 7.4 (ACL user, staging:* keys, noeviction)
                                           │   └───────► MinIO (private bucket, scoped app key)
                                           ▼
                                     BullMQ worker          ── backend network: internal, no ports ──
Operator only: init-local → review-init → build → up (gate probe) → fixture → review-fixture
               → smoke / test:staging → backup → restore-test
```

## Deployment readiness checklist

Two states are deliberately kept apart:

- **Locally tested staging:** done. This is the production-mode stack on this Mac, behind the
  reviewer gate.
- **Externally deployed staging:** not done. No host exists, no DNS record has changed, no public
  port has been opened and no reviewer credential has been issued.

No item below marked ✅ claims anything about an internet-hosted deployment.

| Item                                                            | Locally tested staging                                                                  | Externally deployed staging                                    |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Production-mode full stack builds and runs (7 services healthy) | ✅ Verified on base `828e096`                                                           | ⏸ Not deployed                                                 |
| UI-04 verification homepage                                     | ✅ PR #26 merged; tested through the gate on base `828e096` (desktop and mobile)        | ⏸ Not deployed                                                 |
| Isolated project, volumes, secrets, database, bucket and queues | ✅ `docversity14b`; nothing shared with development or Phase 14A                        | ⏸ New secrets on the host                                      |
| Reviewer gate, fail-closed at startup and restart               | ✅ 4 layers; unit, live-Caddy, Compose and live-stack regressions                       | ✅ VPS configuration checked offline; ⏸ live check on the host |
| Mandatory `staging.py` entrypoint                               | ✅ Required by the runbook ([above](#mandatory-entrypoint-stagingpy-only))              | ⏸ Applies on the host                                          |
| Only the proxy published; backend internal                      | ✅ Asserted (`check-config.py`) and observed (`docker port`)                            | ⏸ External port scan pending                                   |
| Synthetic reviewer accounts (least privilege) and data          | ✅ Created; credentials only in private `.local`                                        | ⏸ Not created on a host                                        |
| Role boundaries and disabled official features                  | ✅ Browser suite: desktop and mobile                                                    | ⏸ Re-run against the public URL                                |
| Phase 12C.1 academic samples stay policy-gated                  | ✅ 15/15 requests return 404; no approved course set                                    | ⏸                                                              |
| Backup and restore                                              | ✅ Rehearsed; encrypted, hash-verified copy outside the worktree; ⚠ no off-machine copy | ⏸ Off-host encrypted backups                                   |
| Repository quality gates                                        | ✅ All exit 0 (916 unit/integration, 72 e2e)                                            | —                                                              |
| Public overlay (80/443, ACME, HSTS)                             | ✅ Prepared and asserted offline; never started                                         | ⏸ Needs a host and domain                                      |
| Hosting (Hostinger KVM 2)                                       | —                                                                                       | ⏸ Awaiting purchase authorization                              |
| Domain and DNS                                                  | —                                                                                       | ⏸ Awaiting decision and authorization                          |
| Reviewer credential distribution                                | —                                                                                       | ⏸ Awaiting approval                                            |
| Monitoring and teardown owner                                   | —                                                                                       | ⏸ Unassigned                                                   |
| Phase 14A `.local` incident                                     | ⚠ Outstanding operational recovery task (separate authorization)                        | —                                                              |

## Remaining launch blockers

- An off-machine copy of the encrypted Phase 14B vault, and escrow of its Keychain key.
- Hosting purchase, domain and DNS authorization.
- Reviewer credential distribution approval.
- Off-host backup destination.
- Monitoring owner.
- The university decisions listed in the approval checklist.
- MinIO licence review for hosted use (carried over from Phase 14A).
