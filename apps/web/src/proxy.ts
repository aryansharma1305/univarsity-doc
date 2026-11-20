import { type NextRequest, NextResponse } from 'next/server';
import { createNonce, reportOnlyCsp } from './lib/csp';
import { loadWebEnv } from './lib/env';

/**
 * Same-origin API proxy: the browser calls `/api/v1/*` on the web origin and Next.js forwards it to
 * the NestJS API (API_INTERNAL_URL, read at request time). This keeps the session cookie host-only
 * on the web origin (`__Host-` in production) and needs no cross-origin CORS for the browser.
 *
 * Every other matched request (pages) gets a per-request nonce and the report-only CSP (`lib/csp.ts`).
 */
export function proxy(request: NextRequest): NextResponse {
  const env = loadWebEnv();
  // The page matcher excludes /api/, so any /api path here came from the /api/v1 matcher.
  if (!request.nextUrl.pathname.startsWith('/api/')) return withCsp(request, env.NODE_ENV);
  const target = new URL(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    env.API_INTERNAL_URL,
  );
  const headers = new Headers(request.headers);
  if (!env.WEB_BEHIND_TRUSTED_PROXY) {
    // This server is the edge: any X-Forwarded-For/X-Real-IP came from the client and is spoofable.
    // Drop them so the API never rate-limits by an attacker-chosen IP. Behind a load balancer that
    // appends the real client IP, set WEB_BEHIND_TRUSTED_PROXY=true to pass the chain through.
    headers.delete('x-forwarded-for');
    headers.delete('x-real-ip');
  }
  return NextResponse.rewrite(target, { request: { headers } });
}

function withCsp(request: NextRequest, nodeEnv: string): NextResponse {
  const nonce = createNonce();
  const reportOnly = reportOnlyCsp(nonce, nodeEnv === 'development');
  const headers = new Headers(request.headers);
  // Next.js takes the nonce for its own scripts from the request's CSP header. The enforced policy
  // (no nonce: a nonce would switch off its 'unsafe-inline') is set in next.config.ts, never here,
  // because headers set on this response are also visible to rendering and would win.
  headers.delete('content-security-policy');
  headers.set('content-security-policy-report-only', reportOnly);
  headers.set('x-nonce', nonce);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy-Report-Only', reportOnly);
  return response;
}

export const config = {
  matcher: [
    '/api/v1/:path*',
    // Pages only: static assets, image optimisation, metadata images and the report sink need no CSP.
    '/((?!api/|_next/static|_next/image|favicon.ico|opengraph-image|csp-report).*)',
  ],
};
