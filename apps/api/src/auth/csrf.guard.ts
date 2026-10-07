import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Errors } from '../common/app-error.js';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import { CSRF_MODE_KEY, type AuthenticatedRequest, type CsrfMode } from './auth.decorators.js';
import { cookieNames, readCookie } from './cookies.js';
import { CSRF_HEADER, CsrfService } from './csrf.service.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global guard #2 — CSRF protection for every unsafe method (POST, PUT, PATCH, DELETE).
 *
 * 1. Origin check: if the browser sends an Origin header it must be an allowed origin.
 * 2. Token check:
 *    - `session` mode (default): X-CSRF-Token must equal the session-derived token. Requests with
 *      no session have nothing to forge (authenticated routes were already rejected by AuthGuard).
 *    - `pre-auth` mode (login, password reset): signed double-submit token, or the session token.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly allowedOrigins: Set<string>;

  constructor(
    private readonly reflector: Reflector,
    private readonly csrf: CsrfService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {
    this.allowedOrigins = new Set(
      [...config.CORS_ORIGINS, new URL(config.WEB_URL).origin].map(normalizeOrigin),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (SAFE_METHODS.has(request.method)) return true;

    const origin = request.header('origin');
    if (origin && !this.allowedOrigins.has(normalizeOrigin(origin))) {
      throw Errors.originNotAllowed();
    }

    const mode =
      this.reflector.getAllAndOverride<CsrfMode | undefined>(CSRF_MODE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'session';
    const provided = request.header(CSRF_HEADER);
    const auth = request.auth;

    if (mode === 'pre-auth') {
      const cookie = readCookie(request, cookieNames(this.config).preAuthCsrf);
      const valid =
        this.csrf.verifyPreAuthToken(cookie, provided) ||
        (auth !== undefined && this.csrf.verifySessionToken(auth.sessionId, provided));
      if (!valid) throw Errors.csrf();
      return true;
    }

    if (!auth) return true;
    if (!this.csrf.verifySessionToken(auth.sessionId, provided)) throw Errors.csrf();
    return true;
  }
}

function normalizeOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}
