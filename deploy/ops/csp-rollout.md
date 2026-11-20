# Content-Security-Policy rollout

Code: `apps/web/src/lib/csp.ts` (both policies), `next.config.ts` (enforced header),
`src/proxy.ts` (per-request nonce + report-only header), `src/app/csp-report/route.ts` (report sink),
`src/instrumentation-client.ts` (Zod JIT probe off). Tests: `apps/web/test/csp.test.ts`,
`apps/web/e2e/security-headers.spec.ts`.

## Stage 1 — this PR (report-only strict, enforced baseline)

- **Enforced** `Content-Security-Policy`: `default-src 'self'`, `object-src 'none'`, `base-uri 'none'`,
  `frame-ancestors 'none'`, `form-action 'self'`, images `'self' data: blob:`, fonts `'self'`,
  `connect-src 'self'`, frames `'self' blob:` + Razorpay checkout, scripts
  `'self' 'unsafe-inline' https://checkout.razorpay.com` (no `unsafe-eval`).
- **Report-only** `Content-Security-Policy-Report-Only`: same, but scripts
  `'self' 'nonce-<per request>' 'strict-dynamic'` and `report-uri /csp-report`.
- Every page now renders per request (`connection()` in the root layout) so Next.js nonces its own
  scripts; previously prerendered public pages (`/`, `/help`, …) lose the prerender cache. Acceptable
  at this traffic; watch p95 after deploy.
- Local evidence: production build, 10 public/sign-in pages, 16/16 and 14/14 script tags nonced,
  0 CSP console violations (enforced or report-only) in headless Chromium. CI e2e covers signed-in
  staff and student pages.

Deploy like any web release (deployment runbook, web-only rollback). Rollback = previous web image.

## Stage 2 — enforce (separate PR + approval)

Gate: ≥ 7 days of production with the web image from stage 1, staff and students active, and an
empty (or fully explained) list of **distinct** violations — (directive, blocked source, page)
tuples, so one noisy browser extension does not hide a real breakage and a single real breakage is
not drowned by counts:

```sh
docker logs --since 168h docversity-university-407e5ed2-uniweb-407e5ed2-1 2>&1 | grep '"msg":"csp-violation"' |
  python3 -c 'import sys,json,collections as c;n=c.Counter((d["directive"],d["blocked"],d["page"]) for d in map(json.loads,sys.stdin));[print(v,*k) for k,v in n.most_common()]'
```

The gate also **fails** if any report was suppressed by the rate limit in the window (the tuple
list would then be incomplete):

```sh
docker logs --since 168h docversity-university-407e5ed2-uniweb-407e5ed2-1 2>&1 | grep '"msg":"csp-report-suppressed"' |
  python3 -c 'import sys,json;n=sum(json.loads(l)["count"] for l in sys.stdin);print("suppressed",n);sys.exit(1 if n else 0)'
```

Each tuple is either fixed in code, allowed in `lib/csp.ts` with a reason, or recorded as
extension/third-party noise (e.g. `chrome-extension`). The alert check (`DV_CSP_MAX`) surfaces spikes
meanwhile. The sink logs at most 20 reports per client and 600 in total per minute
(`lib/csp-report-limit.ts`) and reads at most 8 KB per body, also for chunked bodies.

Switch: in `src/proxy.ts` send the strict nonce policy as the enforced header, on both the request
(Next.js reads its nonce from it) and the response:

```ts
// proxy.ts, stage 2
headers.set('content-security-policy', strict); // was content-security-policy-report-only
response.headers.set('Content-Security-Policy', strict);
```

The static baseline in `next.config.ts` can stay if both headers reach the browser (both are then
enforced; e2e must confirm the response carries the nonce policy, otherwise drop the baseline for pages).
Update the unit/e2e assertions that
expect report-only, rerun e2e (zero violations), release as a web-only change.
Keep the report-uri. Rollback of stage 2: redeploy the stage-1 web image (web-only rollback).

## Not covered

- Vercel: the GitHub repository has a Vercel integration (PR checks "Vercel" / "Vercel Preview
  Comments"), i.e. PR preview builds; production never runs on Vercel. The `vercel.live` comment
  toolbar is intentionally not allowed, so it is blocked (report-only: reported) on previews. Allow
  `https://vercel.live` only if the team wants preview comments, and only for `VERCEL_ENV=preview`.
- `style-src 'unsafe-inline'` stays (React style props, motion/GSAP, sonner). Low risk without script
  injection; revisit only with a style-nonce design.
- `/csp-report` is unauthenticated by nature: body cap, per-client and global per-minute limit (in
  process memory, resets on restart), Docker log rotation (10 MB × 3). No Caddy-level limit is needed.
- Razorpay: the button script's functional hosts (`checkout`/`cdn`/`api.razorpay.com`, frames on
  `razorpay.com`) are allowed app-wide, because a client-side navigation keeps the first page's CSP.
  Its analytics/ad beacons and Google Fonts import stay blocked. e2e asserts every functional request
  passes the enforced policy.
