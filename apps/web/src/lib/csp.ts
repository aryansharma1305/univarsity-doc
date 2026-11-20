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
 * script and its frames (hosts below). The repository has a Vercel GitHub
 * integration that builds PR previews only (production is the Hostinger VPS); its vercel.live comment
 * toolbar is deliberately not allowed, so it is blocked on previews and nothing else changes.
 */

export const CSP_REPORT_PATH = '/csp-report';

/**
 * Razorpay payment button (features/payments/payment-button.tsx), hosts taken from
 * https://checkout.razorpay.com/v1/payment-button.js (2026-11-19): it loads more script from
 * cdn.razorpay.com (color.js, analytics bundle), calls https://api.razorpay.com/v1 by XHR and opens the
 * payment form in an iframe at https://razorpay.com/payment-button/<id>/view (api.razorpay.com in QA
 * mode). Razorpay publishes no CSP host list. Deliberately NOT allowed: the analytics bundle's
 * beacons (lumberjack.razorpay.com, google-analytics, adroll, linkedin, reddit) and the button's Google
 * Fonts @import; the button works without them (system font, no telemetry).
 *
 * Allowed app-wide, not only on the three pages that render the button: a client-side navigation keeps
 * the first document's CSP, so a per-route policy would block the button after in-app navigation.
 */
const RAZORPAY_SCRIPT = 'https://checkout.razorpay.com https://cdn.razorpay.com';
const RAZORPAY_CONNECT = 'https://api.razorpay.com';
const RAZORPAY_FRAMES =
  'https://razorpay.com https://api.razorpay.com https://checkout.razorpay.com';
const RAZORPAY_IMG = 'https://cdn.razorpay.com';

function common(dev: boolean): string[] {
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `img-src 'self' data: blob: ${RAZORPAY_IMG}`,
    "font-src 'self'",
    // React style props, motion/GSAP and sonner's injected <style> need inline styles.
    "style-src 'self' 'unsafe-inline'",
    // Dev only: Next.js hot reload uses a websocket.
    `connect-src 'self'${dev ? ' ws:' : ''} ${RAZORPAY_CONNECT}`,
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
