import type { CookieOptions, Request } from 'express';
import { parseCookie } from 'cookie';
import type { ApiConfig } from '../config/api-config.js';

/**
 * Central cookie configuration.
 *
 * - Production (COOKIE_SECURE=true): `__Host-` prefixed names, which browsers accept only with
 *   Secure, Path=/ and no Domain — i.e. host-only cookies that subdomains cannot set or overwrite.
 * - Local http development (COOKIE_SECURE=false, only allowed for localhost): unprefixed names.
 *
 * Both cookies are HttpOnly: client JavaScript can never read the session or the CSRF cookie.
 */
export interface CookieNames {
  session: string;
  preAuthCsrf: string;
}

export function cookieNames(config: Pick<ApiConfig, 'COOKIE_SECURE'>): CookieNames {
  const prefix = config.COOKIE_SECURE ? '__Host-' : '';
  return { session: `${prefix}dv_session`, preAuthCsrf: `${prefix}dv_csrf` };
}

/**
 * Session cookie: a browser-session cookie (no Max-Age), SameSite=Lax. Server-side idle and
 * absolute expiry are authoritative; closing the browser also ends it.
 */
export function sessionCookieOptions(config: Pick<ApiConfig, 'COOKIE_SECURE'>): CookieOptions {
  return { httpOnly: true, secure: config.COOKIE_SECURE, sameSite: 'lax', path: '/' };
}

/** Pre-authentication CSRF cookie (login, password reset): SameSite=Strict, 30 minutes. */
export const PRE_AUTH_CSRF_MAX_AGE_MS = 30 * 60 * 1000;

export function preAuthCsrfCookieOptions(config: Pick<ApiConfig, 'COOKIE_SECURE'>): CookieOptions {
  return {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: 'strict',
    path: '/',
    maxAge: PRE_AUTH_CSRF_MAX_AGE_MS,
  };
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  const value = parseCookie(header)[name];
  return value && value.length <= 512 ? value : undefined;
}
