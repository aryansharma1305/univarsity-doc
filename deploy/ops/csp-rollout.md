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

Gate: ≥ 7 days of production with the web image from stage 1, staff and students active, and
`docker logs --since 168h <web> | grep -c '"msg":"csp-violation"'` = 0 (or every report explained).
The alert check (`DV_CSP_MAX`) surfaces spikes meanwhile.

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

- No Vercel deployment exists (docs/development/phase-14b-live-staging-deployment.md); `vercel.live`
  is intentionally not allowed. Add it only if a Vercel preview is ever introduced.
- `style-src 'unsafe-inline'` stays (React style props, motion/GSAP, sonner). Low risk without script
  injection; revisit only with a style-nonce design.
- `/csp-report` is unauthenticated by nature; it logs one short line per report, bodies ≤ 8 KB, and
  Docker log rotation (10 MB × 3) bounds disk use.
