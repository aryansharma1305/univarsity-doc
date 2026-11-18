import { permissionsForRoles } from '@docversity/types';
import type { AuthUser, StaffNextStep } from '@docversity/validation';
import type { UserForAuth } from '../users/users.service.js';

export function toAuthUser(
  user: Pick<UserForAuth, 'id' | 'email' | 'displayName' | 'roles'>,
): AuthUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    roles: user.roles,
    permissions: [...permissionsForRoles(user.roles)].sort(),
  };
}

/**
 * The AuthUser view including MFA state and the step the session still has to complete. A session
 * still waiting for its second factor learns nothing about roles or permissions; any restricted
 * session reports no permissions (it has none — see AuthGuard).
 */
export function describeUser(
  user: Pick<UserForAuth, 'id' | 'email' | 'displayName' | 'roles' | 'mfaEnabled'>,
  nextStep: StaffNextStep | null,
): AuthUser {
  const base = toAuthUser(user);
  return {
    ...base,
    roles: nextStep === 'MFA_VERIFY' ? [] : base.roles,
    permissions: nextStep ? [] : base.permissions,
    mfaEnabled: user.mfaEnabled,
    nextStep,
  };
}
