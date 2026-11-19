/**
 * Content-Security-Policy. Two policies are sent together:
 * - `Content-Security-Policy` (enforced, next.config.ts, every route): everything except scripts is
 *   locked to this origin; inline scripts stay allowed for now. It already blocks foreign script
 *   hosts, `eval`, plugins, being framed and form posts elsewhere.
 * - `Content-Security-Policy-Report-Only` (strict, src/proxy.ts, pages): per-request nonce +
 *   `'strict-dynamic'`, no `'unsafe-inline'`. Violations go to `/csp-report` and the web container log.
 *   Once production logs stay clean it replaces the enforced `script-src` (deploy/ops/csp-rollout.md).
 *   Every page renders per request (root layout `connection()`) so Next.js can nonce its scripts.
 *
 * What the app loads (audited for this policy): own JS/CSS chunks; next/font files served from this
 * origin (no Google CDN at runtime); the homepage MOTION_GUARD inline script and GSAP/motion from the
 * bundle; same-origin API calls through the `/api/v1` proxy; images from `/api/v1/*`, `data:` (MFA QR)
 * and `blob:` (photo previews); PDF previews in `blob:` iframes; the Razorpay test payment button
 * script (`https://checkout.razorpay.com`) and its checkout frames. No Vercel deployment exists
 * (docs/development/phase-14b-live-staging-deployment.md), so no vercel.live toolbar is allowed.
 */

export const CSP_REPORT_PATH = '/csp-report';

const RAZORPAY_SCRIPT = 'https://checkout.razorpay.com';
const RAZORPAY_FRAMES = 'https://api.razorpay.com https://checkout.razorpay.com';

function common(dev: boolean): string[] {
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // React style props, motion/GSAP and sonner's injected <style> need inline styles.
    "style-src 'self' 'unsafe-inline'",
    // Dev only: Next.js hot reload uses a websocket.
    dev ? "connect-src 'self' ws:" : "connect-src 'self'",
    `frame-src 'self' blob: ${RAZORPAY_FRAMES}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ];
}

/** Enforced policy: static, so it is set in next.config.ts for every route. */
export function enforcedCsp(dev: boolean): string {
  // React dev tooling needs eval; production builds never do.
  const evalSrc = dev ? " 'unsafe-eval'" : '';
  return [...common(dev), `script-src 'self' 'unsafe-inline'${evalSrc} ${RAZORPAY_SCRIPT}`].join(
    '; ',
  );
}

/** Strict report-only policy with this request's nonce; set by src/proxy.ts on pages. */
export function reportOnlyCsp(nonce: string, dev: boolean): string {
  const evalSrc = dev ? " 'unsafe-eval'" : '';
  return [
    ...common(dev),
    // Hosts are ignored by 'strict-dynamic' browsers; kept as the fallback for older ones.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${evalSrc} ${RAZORPAY_SCRIPT}`,
    `report-uri ${CSP_REPORT_PATH}`,
  ].join('; ');
}

/** 128-bit random nonce, base64 (Web Crypto: the proxy runs in the edge-compatible runtime). */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
