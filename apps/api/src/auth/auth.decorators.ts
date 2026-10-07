import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@docversity/types';
import type { Request } from 'express';
import { Errors } from '../common/app-error.js';
import type { SessionRecord } from './session.store.js';

/** `required` (default): a valid session is mandatory. `optional`: attach it if present. `none`: ignore. */
export type AuthMode = 'required' | 'optional' | 'none';
/**
 * `session` (default for unsafe methods): X-CSRF-Token must match the session's token.
 * `pre-auth`: signed double-submit token from GET /auth/csrf (login, password reset).
 */
export type CsrfMode = 'session' | 'pre-auth';

export const AUTH_MODE_KEY = 'docversity:auth-mode';
export const CSRF_MODE_KEY = 'docversity:csrf-mode';
export const PERMISSIONS_KEY = 'docversity:permissions';

/** No session required (e.g. health, login). `optional` still attaches a session if one is present. */
export const Public = (mode: Exclude<AuthMode, 'required'> = 'none') =>
  SetMetadata(AUTH_MODE_KEY, mode);
export const CsrfPreAuth = () => SetMetadata(CSRF_MODE_KEY, 'pre-auth' satisfies CsrfMode);
/** Requires ALL listed permissions. Implies an authenticated session. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  permissions: ReadonlySet<Permission>;
}

export interface AuthContext {
  /** Raw session ID — internal only; never returned or logged. */
  sessionId: string;
  session: SessionRecord;
  user: AuthenticatedUser;
}

export type AuthenticatedRequest = Request & { auth?: AuthContext };

/** The authenticated context. Throws 401 if absent (use only on authenticated routes). */
export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const auth = context.switchToHttp().getRequest<AuthenticatedRequest>().auth;
    if (!auth) throw Errors.authRequired();
    return auth;
  },
);

/** The authenticated context if present (for `@Public('optional')` routes). */
export const OptionalAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext | undefined =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().auth,
);
