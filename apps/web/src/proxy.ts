import { type NextRequest, NextResponse } from 'next/server';
import { loadWebEnv } from './lib/env';

/**
 * Same-origin API proxy: the browser calls `/api/v1/*` on the web origin and Next.js forwards it to
 * the NestJS API (API_INTERNAL_URL, read at request time). This keeps the session cookie host-only
 * on the web origin (`__Host-` in production) and needs no cross-origin CORS for the browser.
 */
export function proxy(request: NextRequest): NextResponse {
  const env = loadWebEnv();
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

export const config = {
  matcher: '/api/v1/:path*',
};
