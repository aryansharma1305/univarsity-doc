import { type AuthUser, authUserSchema } from '@docversity/validation';
import { cookies } from 'next/headers';
import { loadWebEnv } from './env';

const SESSION_COOKIES = ['dv_session', '__Host-dv_session'];

export type SessionState =
  | { status: 'authenticated'; user: AuthUser }
  | { status: 'anonymous' }
  /** The API (or its session store) could not answer. Treated as NOT signed in — fail closed. */
  | { status: 'unavailable' };

/**
 * Asks the API who the current user is, forwarding the browser's cookies server-to-server.
 * The API is authoritative; this only decides what to render or where to redirect.
 */
export async function getSessionState(): Promise<SessionState> {
  const jar = await cookies();
  if (!SESSION_COOKIES.some((name) => jar.has(name))) return { status: 'anonymous' };

  const { API_INTERNAL_URL } = loadWebEnv();
  try {
    const response = await fetch(new URL('/api/v1/auth/me', API_INTERNAL_URL), {
      headers: { cookie: jar.toString(), accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
    if (response.status === 401) return { status: 'anonymous' };
    if (!response.ok) return { status: 'unavailable' };
    const parsed = authUserSchema.safeParse(await response.json());
    return parsed.success
      ? { status: 'authenticated', user: parsed.data }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}
