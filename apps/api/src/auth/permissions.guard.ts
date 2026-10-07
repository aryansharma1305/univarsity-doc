import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@docversity/types';
import { Errors } from '../common/app-error.js';
import { type AuthenticatedRequest, PERMISSIONS_KEY } from './auth.decorators.js';

/**
 * Global guard #3 — authorization. Routes declare what they need with
 * `@RequirePermissions(PERMISSIONS.x, …)`; the user's permissions come from their database roles via
 * the code-defined ROLE_PERMISSIONS map. Controllers never check roles themselves.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const auth = context.switchToHttp().getRequest<AuthenticatedRequest>().auth;
    if (!auth) throw Errors.authRequired();
    if (!required.every((permission) => auth.user.permissions.has(permission))) {
      throw Errors.forbidden();
    }
    return true;
  }
}
