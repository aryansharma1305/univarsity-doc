import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import { randomToken, safeEqual } from './identifier-hasher.js';

export const CSRF_HEADER = 'x-csrf-token';

/**
 * CSRF tokens.
 *
 * Authenticated requests — synchronizer token derived from the session:
 *   token = HMAC-SHA256(SESSION_SECRET, "csrf:" + sessionId)
 * It is never stored (nothing extra in Redis), changes whenever the session changes (login rotates
 * it), and cannot be computed without both the server secret and the HttpOnly session cookie.
 *
 * Pre-authentication requests (login, forgot/reset password) — signed double-submit:
 *   token = nonce + "." + HMAC(SESSION_SECRET, "pre-auth-csrf:" + nonce)
 * GET /auth/csrf sets it in an HttpOnly SameSite=Strict cookie AND returns it in the body; the
 * client echoes the body value in X-CSRF-Token. A cross-site attacker can neither read the body nor
 * plant a validly signed cookie (and `__Host-` cookies cannot be set from subdomains).
 */
@Injectable()
export class CsrfService {
  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}

  sessionToken(sessionId: string): string {
    return this.sign('csrf', sessionId);
  }

  verifySessionToken(sessionId: string, provided: string | undefined): boolean {
    return typeof provided === 'string' && safeEqual(this.sessionToken(sessionId), provided);
  }

  createPreAuthToken(): string {
    const nonce = randomToken(24);
    return `${nonce}.${this.sign('pre-auth-csrf', nonce)}`;
  }

  verifyPreAuthToken(cookieValue: string | undefined, provided: string | undefined): boolean {
    if (!cookieValue || !provided || !safeEqual(cookieValue, provided)) return false;
    const [nonce, signature, ...rest] = cookieValue.split('.');
    if (!nonce || !signature || rest.length > 0) return false;
    return safeEqual(this.sign('pre-auth-csrf', nonce), signature);
  }

  private sign(purpose: string, value: string): string {
    return createHmac('sha256', this.config.SESSION_SECRET)
      .update(`${purpose}:${value}`)
      .digest('base64url');
  }
}
