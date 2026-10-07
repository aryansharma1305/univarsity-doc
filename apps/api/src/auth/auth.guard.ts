import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { permissionsForRoles } from '@docversity/types';
import type { Response } from 'express';
import { Errors } from '../common/app-error.js';
import { currentRequestContext } from '../common/request-context.js';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import { UsersService } from '../users/users.service.js';
import { AUTH_MODE_KEY, type AuthenticatedRequest, type AuthMode } from './auth.decorators.js';
import { cookieNames, readCookie, sessionCookieOptions } from './cookies.js';
import { SessionStore } from './session.store.js';

/**
 * Global guard #1 — authentication. Every route requires a valid session unless marked
 * `@Public()`. The user (status + roles) is reloaded from the database on every request, so
 * disabling a user or changing roles takes effect immediately. Redis failures fail closed (503).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionStore,
    private readonly users: UsersService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const mode =
      this.reflector.getAllAndOverride<AuthMode | undefined>(AUTH_MODE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'required';
    if (mode === 'none') return true;

    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const names = cookieNames(this.config);

    const sessionId = readCookie(request, names.session);
    if (!sessionId) {
      if (mode === 'required') throw Errors.authRequired();
      return true;
    }

    const record = await this.sessions.read(sessionId);
    const user = record ? await this.users.findForAuthById(record.userId) : null;
    if (!record || user?.status !== 'ACTIVE') {
      if (record && user?.status !== 'ACTIVE') {
        await this.sessions.revokeAllForUser(record.userId);
      }
      response.clearCookie(names.session, sessionCookieOptions(this.config));
      if (mode === 'required') throw Errors.sessionExpired();
      return true;
    }

    const session = await this.sessions.touch(sessionId, record);
    request.auth = {
      sessionId,
      session,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: user.roles,
        permissions: permissionsForRoles(user.roles),
      },
    };
    const requestContext = currentRequestContext();
    if (requestContext) requestContext.userId = user.id;
    return true;
  }
}
