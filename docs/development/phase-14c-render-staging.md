# Phase 14C — Temporary Render staging for university review

Status: **draft PR; nothing provisioned.** No cloud account, billing detail, image push, public
resource, DNS change or credential distribution has happened. Every such step below waits for the
project owner's separate approval.

Decision (22 October 2026): **Option B.** Every application service runs on Render, and documents go
to private Cloudflare R2 storage. Vercel is not used. This is a bridge until the university approves
the Hostinger KVM 2 purchase. Then the stack moves to the VPS with the Phase 14B runbook, and this
deployment is deleted.

## Architecture

```text
Reviewer ─HTTPS─► Render edge (TLS) ─► docversity14c-edge  [web service; the ONLY public service]
                                         Caddy 14B image + reviewer gate (Secret File)
                                           │ Render private network (Singapore)
                         ┌─────────────────┴─────────────────┐
                         ▼                                   ▼
               docversity14c-web [private]        docversity14c-api [private] ──► R2 bucket (HTTPS,
               Next.js; /api/v1 proxy ──────────►   NestJS + Chromium                bucket-scoped token)
                                                        │      │
                         docversity14c-worker ──────────┤      │
                         [background worker, BullMQ]    ▼      ▼
                                          docversity14c-kv   docversity14c-db
                                          Key Value          PostgreSQL 17
                                          (internal only)    (internal only)
```

- **Same topology as Phase 14B** (Caddy → Next.js → API), so these are unchanged:
  - the same-origin cookie and CSRF model;
  - `__Host-` cookies;
  - the exact CORS origin;
  - `TRUST_PROXY=2`.
- **Public URL:** `https://docversity14c-edge.onrender.com`, Render's own subdomain. No DNS change.
- **Images:** the Phase 14B Dockerfile targets (`api`, `web`, `worker`) built for `linux/amd64`,
  plus a small edge image (`deploy/render/Dockerfile.edge`). The edge image is the pinned 14B Caddy
  with `review-site.caddy` and a fail-closed entrypoint added. GitHub Actions builds them; see
  [Private image publishing](#private-image-publishing).

## What changed (branch `feature/phase-14c-render-staging`)

| File                                                                                          | Change                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/validation/src/uploads.ts`                                                          | `uploadRequestBodyLimitBytes()` returns the largest upload of any endpoint plus 1 MiB of multipart overhead. That is 16 MiB by default                                                                                                                                                                                                                                     |
| `apps/web/next.config.ts`                                                                     | The proxy buffer uses that helper. It used to be import limit + 1 = 11 MiB, which **truncated historical documents of 11–15 MiB**                                                                                                                                                                                                                                          |
| `deploy/review-site.caddy`                                                                    | **Body limit:** 12 MB → `16MiB`, exactly the proxy buffer.<br>**Upstreams:** configurable (defaults `api:4000`/`web:3000`, unchanged for Compose).<br>**Client IP:** every upstream receives exactly one `X-Forwarded-For` value (`{client_ip}`)                                                                                                                           |
| `deploy/render/Caddyfile.render`, `Dockerfile.edge`, `edge-start.sh`                          | **Edge:** plain HTTP on `$PORT`; the gate is imported from `/etc/secrets/review_gate.caddy`; admin API off.<br>**Client IP:** trusted-proxy, client-IP resolution is spoof-resistant (`trusted_proxies_strict`).<br>**Logging:** the access log drops all headers.<br>**Process:** non-root, using a capability-free Caddy binary. Refuses to start without valid settings |
| `deploy/render/render.yaml`                                                                   | Blueprint with the exact specifications (below). It lives outside the repository root, so Render never detects it. It validates against Render's published schema with 0 errors                                                                                                                                                                                            |
| `deploy/render/roles.sql`, `role-probe.sql`                                                   | Separates the owner and runtime roles on a managed, non-superuser PostgreSQL, ending with a self-check. The probe is read-only                                                                                                                                                                                                                                             |
| `deploy/render/render.py`                                                                     | Operator tool. `init`, `gate`, `assemble` and `window` are local only. `roles`, `migrate`, `fixture`, `probe` and `ip-probe` are live actions and refuse to run without `--authorized`                                                                                                                                                                                     |
| `.github/workflows/staging-images.yml`, `deploy/render/images.sh`                             | Builds the four `linux/amd64` images on every relevant PR (no push). Pushes only on an approved manual dispatch, privately, by immutable tag (see below)                                                                                                                                                                                                                   |
| `deploy/render/pdf-memory.mjs`                                                                | Measures the cgroup peak memory of the real PDF renderers                                                                                                                                                                                                                                                                                                                  |
| `deploy/render/edge_regression.py`, `roles_rehearsal.py`, `test_render.py`, `check_render.py` | Tests (evidence below). Added to the CI staging job                                                                                                                                                                                                                                                                                                                        |
| `deploy/scripts/gate-check.mjs`                                                               | Optional `GATE_CHECK_HOST`, so the probe can target the public edge with system TLS trust. The 14B default is unchanged                                                                                                                                                                                                                                                    |
| `deploy/scripts/fixture.mjs`, `review-fixture.mjs`                                            | The host guard accepts `STAGING_DATABASE_HOST`, which `render.py` sets to the validated Render host. The default is still `postgres`                                                                                                                                                                                                                                       |
| `apps/web/playwright.staging.config.ts`                                                       | `STAGING_SECRETS_DIR=render` runs the 14B browser smoke suite against the Render instance                                                                                                                                                                                                                                                                                  |
| `apps/web/e2e/historical-documents.spec.ts`, unit tests                                       | A 14.9 MiB PDF passes through the real proxy byte-identical; a larger request gets the API's 413                                                                                                                                                                                                                                                                           |

Application behaviour is otherwise unchanged:

- public verification stays a placeholder;
- publication stays blocked (409/403);
- certificate approval stays disabled;
- no issuance or payment path exists.

No flag is added or flipped.

## Local verification (22 October 2026)

| Check                                                                                                | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `edge_regression.py` (real edge image, throwaway network)                                            | **25/25 PASS.**<br>**Gate variants:** valid → 401 from the first response; missing, empty, unwrapped, misnamed and plaintext → never listens; empty snippet refused by the validator.<br>**Settings:** six missing or malformed edge settings → refuses to start.<br>**Routes:** 21 anonymous or wrong-credential requests → 401; `robots.txt` public; admin API off; runs as `65534`.<br>**Client IP:** a forged prepended `X-Forwarded-For`, a forged `True-Client-IP`, and any value from an untrusted peer are all ignored; exactly one forwarded entry.<br>**Body size:** 15.5 MiB and exactly 16 MiB pass intact; 16 MiB + 1 byte → 413 |
| Phase 14B `gate_regression.py` and `check-config.py` with the changed `review-site.caddy`            | PASS (16 checks) / PASS                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `roles_rehearsal.py` (PostgreSQL 17; administrator with only CREATEROLE + CREATEDB, not a superuser) | **20/20 PASS.** All migrations ran as `docversity_owner`, which owns all 41 tables. Both fixtures ran as the runtime role through the new host guard, and every seeded student is SYNTHETIC. The runtime role has exactly SELECT/INSERT/UPDATE/DELETE. CREATE TABLE/SCHEMA/FUNCTION/ROLE, ALTER, DROP and TRUNCATE are refused. The administrator keeps no SET on the owner role, and a second run refuses instead of rotating passwords                                                                                                                                                                                                      |
| PDF peak memory (14B API image, 2 GiB cgroup, 1 CPU, arm64)                                          | Each renderer alone: peaks of 129, 264 and 292 MiB. **Worst case** (the API allows 2 concurrent renders per preview service × 2 services = 4 Chromium instances): **437 MiB peak, 0 OOM kills**, 6.3 s. With the API's ~250 MiB at rest, about 0.7 GiB → `1c-2g` (2 GiB) has about 3× headroom. A 512 MB instance would fail                                                                                                                                                                                                                                                                                                                  |
| e2e `historical-documents.spec.ts`                                                                   | 5/5 PASS, including the new near-limit test. **Negative control:** with the old 11 MiB proxy buffer, the new test fails (the upload never reaches the API)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `render.py` tests / `check_render.py` / Blueprint schema                                             | 7/7 PASS / PASS / 0 errors. The schema check caught that YAML reads a bare `off` as boolean `false` (fixed)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Format, lint, typecheck, build (uncached)                                                            | All exit 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

**Issues found and fixed during this work:**

1. **Upload limits.** The proxy buffer (11 MiB) and the gate limit (12 MB) both cut off valid 15 MiB
   document uploads.
2. **Unvalidated edge settings.** Caddy silently accepts empty trusted-proxy and header settings, so
   the edge entrypoint now refuses to start without them.
3. **Capabilities.** The stock Caddy binary can't run as non-root with no capabilities.
4. **Schema grants.** On a managed database, schema grants issued by the administrator after handing
   the schema to the owner are silent no-ops. Only a warning is printed. They now run as the owner,
   and an assertion fails loudly.
5. **YAML booleans.** A bare `off` in the Blueprint was read as `false`.

## Go/no-go checks on the real platform (after approval)

| #        | Check                              | Command                                                                    | Pass condition                                                                                                                                                                                                                                             |
| -------- | ---------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G2       | Managed role separation            | `render.py roles --authorized` (runs the read-only `role-probe.sql` first) | The probe shows `can_create_roles = t` and that the administrator controls the public schema; `roles.sql`'s self-check passes                                                                                                                              |
| G3       | Client IP through Render's proxies | `render.py ip-probe --authorized`, then check the Render edge log          | Six logins with forged client-IP headers give `401 ×5, 429`. The log line for the probe marker shows this machine's public IP as `client_ip`. If not, change `RENDER_TRUSTED_PROXIES` / `RENDER_CLIENT_IP_HEADER` and repeat. **Not live until it passes** |
| G4       | PDF memory on amd64                | Staff previews (4 concurrent) while watching the API's Render metrics      | Peak under 1.4 GiB, no restarts                                                                                                                                                                                                                            |
| Edge     | Secret File readable by non-root   | First edge deploy                                                          | The edge starts as uid 65534 and reads `/etc/secrets/review_gate.caddy`. If Render mounts it root-only, the edge refuses to start (fail closed); the only change needed is the image `USER`                                                                |
| Gate     | Post-deploy probe                  | `render.py probe --authorized`                                             | 33 refusals, reviewer admitted. **On failure the edge is suspended** (Render API) or the operator is told to suspend it                                                                                                                                    |
| E2E      | Browser smoke                      | `STAGING_SECRETS_DIR=render pnpm --filter @docversity/web test:staging`    | The Phase 14B suite passes against the public URL                                                                                                                                                                                                          |
| Data     | Persistence                        | Upload a synthetic document → redeploy all services → download             | SHA-256 identical                                                                                                                                                                                                                                          |
| Exposure | Only the edge is public            | Render dashboard / API service list                                        | Next.js and the API are `pserv`; PostgreSQL and Key Value allowlists are empty (after the operator's temporary /32 is removed)                                                                                                                             |

**If G2 fails:** Render's administrator can't create roles. Evaluate Neon before proposing anything
weaker:

- **Neon fits:** its `neon_superuser` members have CREATEROLE, so the same `roles.sql` applies. It
  has a free tier and a Singapore region (AWS `ap-southeast-1`).
- **Neon costs:** the database is reached over the public internet with TLS instead of Render's
  private network, so it has a public endpoint. IP allowlisting is a paid Neon feature. It adds
  cross-provider latency and cold starts.
- **Proposal:** a single-role fallback would be proposed only if Neon is also unacceptable, and only
  with your explicit approval.

## Render service specifications and cost

Prices are Render's own list prices, read from render.com/pricing on 23 October 2026 (Singapore
uses the same prices). Render bills compute and storage **per second**, so a resource costs only for
the time it exists.

| Service                                     | Render type                       | Plan                                                | RAM / CPU   |  Per month |      14 days |
| ------------------------------------------- | --------------------------------- | --------------------------------------------------- | ----------- | ---------: | -----------: |
| `docversity14c-edge` (Caddy + gate)         | Web service (the only public one) | `0.5c-512mb`                                        | 512 MB / <1 |      $7.00 |        $3.23 |
| `docversity14c-web` (Next.js)               | Private service                   | `0.5c-512mb`                                        | 512 MB / <1 |      $7.00 |        $3.23 |
| `docversity14c-api` (NestJS + Chromium)     | Private service                   | `1c-2g`                                             | 2 GB / 1    |     $25.00 |       $11.69 |
| `docversity14c-worker` (BullMQ)             | Background worker                 | `0.5c-512mb`                                        | 512 MB / <1 |      $7.00 |        $3.23 |
| `docversity14c-kv` (noeviction, persistent) | Key Value                         | `256mb`                                             | 256 MB      |     $10.00 |        $4.67 |
| `docversity14c-db` (PostgreSQL 17)          | Postgres                          | `0.1c-256mb`                                        | 256 MB      |      $6.00 |        $2.80 |
| PostgreSQL storage                          |                                   | 1 GB × $0.30                                        |             |      $0.30 |        $0.14 |
| Render workspace                            | Hobby                             | $0 + compute; 25 services; 5 GB bandwidth           |             |      $0.00 |        $0.00 |
| Cloudflare R2                               | Standard storage, free tier       | 10 GB-month, 1 M Class A, 10 M Class B, free egress |             |      $0.00 |        $0.00 |
| GitHub Container Registry                   | Private package                   | storage and bandwidth currently free                |             |      $0.00 |        $0.00 |
| **Total**                                   |                                   |                                                     |             | **$62.30** | **≈ $29.00** |

The 14-day compute figures use Render's published per-minute rates ($0.00016/min for `0.5c-512mb`,
$0.00058/min for `1c-2g`) × 20,160 minutes. Key Value, Postgres and storage are prorated from their
monthly price over 30 days.

**Expected maximum for the 14-day window: about $31**, before tax:

- **Expected cost:** about $29.
- **Bandwidth overage:** 5 GB is included, then $0.15/GB. Synthetic reviewer traffic is far below
  that; even 10 GB over would add $1.50.
- **Plan headroom:** if G4 forces the API to `2c-4g` ($85/month, $0.00197/min), the window rises by
  about $28. That's only expected if the live measurement contradicts the local one, and it needs
  your approval.
- **Each 7-day extension:** about $14.50.

**Charges that are not prorated or not covered above:**

- **Bandwidth over 5 GB:** billed per GB of usage, not by time.
- **Workspace plans:** a Pro workspace would be $25/month. It isn't needed; stay on Hobby.
- **Taxes:** GST/VAT is added according to the billing address, and the card issuer may add
  currency-conversion fees. None of this is in the figures above.
- **R2:** usage beyond the free tier is rounded up to the next billing unit. Standard storage has no
  minimum storage duration; Infrequent Access has 30 days but is not used.
- **GHCR:** GitHub states it gives at least one month's notice before billing container storage.

For comparison, Hostinger KVM 2 is $8.79/month promotional, paid upfront for the term, and renews at
$14.99. The Render bridge is cheaper only for windows under about two months.

## Private image publishing

- **Registry:** a private GitHub Container Registry package,
  `ghcr.io/<owner>/docversity14c-staging`, one package holding four tags. The repository is
  **public**, but a GHCR package starts **private** and doesn't inherit repository visibility.
  Visibility is never changed by any script or workflow. A public package can never be made private
  again, so nobody should touch that setting.
- **Pull requests:** `.github/workflows/staging-images.yml` builds all four `linux/amd64` images on
  GitHub's x86 runners. It checks that the edge image refuses to start without its gate, and pushes
  nothing.
- **Publishing:** a manual `workflow_dispatch` with `publish: true` only. Every one of these must
  hold:
  - it runs from `main` or the Phase 14C branch;
  - it goes through the `staging-images` environment, which must have a required reviewer (the job
    refuses to publish if the environment is unprotected);
  - it uses the job's short-lived `GITHUB_TOKEN`, with `packages: write` granted to that job alone.
- **Immutable tags:** `<role>-<full commit SHA>`. The script refuses to overwrite an existing tag.
  The job summary lists each image's digest, and `render.yaml` pins those digests.
- **Proof of privacy:** after pushing, the job tries an anonymous read of every image and fails if
  any succeeds.
- **Render's pull credential:** a classic GitHub token with only `read:packages`, a 30-day expiry,
  stored only as the Render registry credential `docversity14c-ghcr-read`. Revoke it at teardown.

## Security controls

**Single public entry point**

- Only the edge has a public URL. Next.js and the API are private services. The worker has no
  listener.
- PostgreSQL and Key Value refuse all external connections (empty allowlist).
- Preview environments are off, and nothing auto-deploys.

**Reviewer gate, fail closed, in four layers**

1. `render.py` validates the gate before writing any Secret File. `assemble` refuses an invalid gate.
2. `edge-start.sh` refuses missing or malformed settings or a missing gate file.
3. Caddy refuses a missing or invalid gate; the admin API is off.
4. The post-deploy probe suspends the edge on any unexpected answer.

Until the Secret Files exist, every service fails to start rather than running unprotected.

**Credentials and secrets**

- **Credentials:** one shared bcrypt gate credential. The synthetic staff and student accounts have
  random passwords of at least 32 characters. Everything is generated locally into
  `.local/render` (0700; files 0400/0444) and never printed, committed or baked into an image.
- **Secrets:** Render Secret Files only. No secret appears in the Blueprint or in env-var values
  (asserted by `check_render.py`). Role passwords reach `psql` through the environment, never argv.

**Data stores and storage**

- **Database:** the owner and runtime roles are separate, so the runtime role can't change the
  schema (G2). The operator's IP is allowlisted only while running `roles`/`migrate`/`fixture`, over
  `sslmode=verify-full`.
- **Key Value:** `noeviction`, so BullMQ never loses keys. There's no Redis ACL user on Render (a
  degradation from 14B); this is mitigated by internal-only access.
- **R2:** a private bucket named `docversity14c-*` (other names are refused by `render.py`), with an
  Object Read & Write token scoped to that bucket only. No public bucket or `r2.dev` URL.

**Edge headers and logging**

- `X-Robots-Tag: noindex`, `robots.txt` disallows all, HSTS.
- Client IP is resolved spoof-resistantly; one `X-Forwarded-For` value is passed downstream (G3).
- The access log contains no headers, cookies or credentials.

**Data and behaviour**

- Only synthetic data: fresh fixtures on an empty database. No dump, volume or object is copied from
  any local stack.
- Verification placeholders stay as they are. Publication, certificate approval, issuance and live
  payments remain disabled in code and database.

**Known degradations vs Phase 14B**

- Render doesn't expose read-only root filesystems or capability dropping.
- No Redis ACL user.
- Backups are Render's daily PostgreSQL backups, not the 14B writers-stopped snapshot. Synthetic
  data can always be re-seeded.

## Exact setup steps (each needs your separate approval)

Steps marked **public** create something reachable from the internet. Steps marked **billing** add a
payment method or create a billed resource.

1. **GitHub (you):** create the environment `staging-images` (Settings → Environments) with
   yourself as required reviewer, restricted to the `main` and `feature/phase-14c-render-staging`
   branches.
2. **Publish images (you approve the run):** Actions → _Staging images_ → _Run workflow_ on the
   reviewed commit with `publish: true`. Approve the environment. Check the job summary: four
   digests, and "anonymous reads refused". Then confirm each image shows as **Private** under
   Packages.
3. **Read-only pull token (you):** create a classic token with only `read:packages`, expiring in
   30 days. Keep it for step 6; never paste it into chat or a file in the repository.
4. **Cloudflare R2 (billing; you):**
   1. Create a Cloudflare account and enable R2 (a payment method is required).
   2. Create the bucket `docversity14c-staging`, with location hint Asia-Pacific. Leave Public access
      off and r2.dev disabled; add no custom domain and no CORS rules.
   3. Create an R2 API token with **Object Read & Write**, applied to that bucket only, and the
      shortest TTL that covers the window.
   4. Note the account endpoint, access key ID and secret access key.
5. **Render account (billing; you):** sign up, keep the **Hobby** workspace, and add a card.
6. **Registry credential (you):** in Render, open Settings → Registry Credentials and add a GitHub
   credential named `docversity14c-ghcr-read` (your GitHub username + the step 3 token).
7. **Fill in the Blueprint (me, reviewed by you):** put the owner and the four digests into
   `deploy/render/render.yaml`; `check_render.py` must pass.
8. **Billing, public — apply the Blueprint (you confirm the price):** New → Blueprint → this
   repository, Blueprint path `deploy/render/render.yaml`.
   - Leave the four edge settings with `sync: false` empty for now.
   - Render shows each resource and plan before you confirm; the total must match the table above.
   - The services fail to start until step 10, by design.
9. **Local secrets (me):**
   1. `python3 deploy/render/render.py init` and `python3 deploy/render/render.py gate`.
   2. Fill `.local/render/provider.env`. The `RENDER_TRUSTED_PROXIES` and `RENDER_CLIENT_IP_HEADER`
      values start as `private_ranges` / `X-Forwarded-For` and are confirmed in step 12.
   3. `python3 deploy/render/render.py assemble`.
10. **Secret Files (me, in the Render dashboard).**
    - **Uploads:** `review_gate.caddy` → edge; `web_runtime` → web; `runtime` → api; `runtime` → worker.
    - **Edge environment:** taken from `secret-files/edge/environment`.
11. **Database (me).**
    1. Add this machine's /32 to the database allowlist.
    2. Run `render.py roles --authorized`. **G2 decides:** if the probe or `roles.sql` fails, stop
       and report. Nothing is downgraded to a single role (Neon is evaluated first, with your
       approval).
    3. Run `migrate --authorized`, then `fixture --authorized` (synthetic records only).
    4. **Remove the allowlist entry.**
12. **Deploy and verify (me):** deploy all four services, then run every check:
    - `probe` (the edge is suspended on failure);
    - `ip-probe` (G3) and the edge log check;
    - G4 PDF memory;
    - a 15 MiB upload/download;
    - `test:staging` (authentication, roles, policy gates);
    - persistence across redeploys;
    - exposure.

    The evidence is reported to you; **nobody receives a credential before that.**

13. **Go-live (you approve):** `render.py window --start`. You distribute reviewer credentials
    privately, with the gate credential separate from the application accounts.

## Review window and teardown

- **Window:** 14 days from `render.py window --start`. `render.py window` shows the time remaining.
- **Extension:** manual only, 1–14 days at a time, with a recorded reason:
  `render.py window --extend 7 --reason "…"`.
- **Ending the window:** teardown removes everything; there is no partial shutdown. Suspension is
  only for incident containment and isn't relied on to stop charges.

**Teardown — how every charge stops:**

1. **Render:**
   - Delete `docversity14c-edge`, `-web`, `-api` and `-worker`, then `docversity14c-kv`, then
     `docversity14c-db` (this permanently deletes the synthetic data and its backups).
   - Delete the Blueprint and the registry credential.
   - Billing stops at deletion, to the second. The month's invoice covers only the time used, plus
     any bandwidth over 5 GB and tax.
2. **R2:** delete all objects, then the bucket, then the API token. With nothing stored, R2 bills
   nothing.
3. **GitHub:**
   - Revoke the `read:packages` token.
   - Delete the `docversity14c-staging` package versions (or the package).
   - Optionally delete the `staging-images` environment.
4. **Render API key:** revoke it, if one was created for automatic suspension.
5. **Local:** delete `.local/render` once you no longer need the synthetic evidence.
6. **Confirm** that the Render billing page lists no active resources and R2 shows no buckets. Remove
   the payment methods if you want no future charges to be possible.

## Moving to the Hostinger VPS later

The VPS uses the Phase 14B path unchanged:

- `init-local.py --public-origin` and `compose.public.yml`;
- the same images, the same `review-site.caddy`, the same environment variable names;
- the same gate format, the same fixtures.

The data is synthetic, so the VPS is seeded fresh. No migration from Render is needed (a `pg_dump` +
`mc mirror` from R2 is possible if wanted). Then tear down Render (above).

## Secret Files and environment (names only)

- **edge** (env):
  - `PORT`;
  - `RENDER_TRUSTED_PROXIES` and `RENDER_CLIENT_IP_HEADER`;
  - `WEB_UPSTREAM` and `API_UPSTREAM`.

  Secret File: `review_gate.caddy`.

- **web** (`RUNTIME_ENV_FILE=/etc/secrets/web_runtime`): `NODE_ENV`, `API_INTERNAL_URL`,
  `WEB_BEHIND_TRUSTED_PROXY`.
- **api** (`RUNTIME_ENV_FILE=/etc/secrets/runtime`):
  - **General:** `NODE_ENV`, `LOG_LEVEL`, `API_HOST`, `API_PORT`, `WEB_URL`, `CORS_ORIGINS`,
    `SWAGGER_ENABLED`, `TRUST_PROXY`.
  - **Sessions:** `COOKIE_SECURE`, `SESSION_SECRET`.
  - **Data stores:** `DATABASE_URL`, `REDIS_URL`, `REDIS_KEY_PREFIX`, `QUEUE_PREFIX`.
  - **Storage:** `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`,
    `S3_FORCE_PATH_STYLE`.
  - **Worker settings:** `WORKER_CONCURRENCY`, `IMPORT_CONCURRENCY`.
- **worker** (`RUNTIME_ENV_FILE=/etc/secrets/runtime`): the API's database, Redis, queue, storage and
  concurrency keys. No `SESSION_SECRET`.
- **Operator only** (`.local/render/provider.env`):
  - **Edge and private addresses:** `EDGE_ORIGIN`, `EDGE_SERVICE_ID`, `WEB_PRIVATE_HOSTPORT`,
    `API_PRIVATE_HOSTPORT`.
  - **Database:** `DATABASE_INTERNAL_HOST`, `DATABASE_EXTERNAL_HOST`, `DATABASE_ADMIN_USER`,
    `DATABASE_ADMIN_PASSWORD`.
  - **Key Value:** `REDIS_INTERNAL_URL`.
  - **R2:** `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
  - **Client IP:** `RENDER_TRUSTED_PROXIES`, `RENDER_CLIENT_IP_HEADER`.
  - **Environment, never stored:** `RENDER_API_KEY` (optional, for automatic suspension).
