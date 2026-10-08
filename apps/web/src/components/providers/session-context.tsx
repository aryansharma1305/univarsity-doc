'use client';

import type { Permission } from '@docversity/types';
import type { AuthUser } from '@docversity/validation';
import { createContext, type ReactNode, useContext } from 'react';

const SessionContext = createContext<AuthUser | null>(null);

export function SessionProvider({ user, children }: { user: AuthUser; children: ReactNode }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useSessionUser(): AuthUser {
  const user = useContext(SessionContext);
  if (!user) throw new Error('useSessionUser must be used inside SessionProvider');
  return user;
}

/**
 * Whether the signed-in user holds a permission. UI hint only — used to hide controls the user
 * cannot use. The API enforces every permission regardless.
 */
export function useCan(permission: Permission): boolean {
  return useSessionUser().permissions.includes(permission);
}
