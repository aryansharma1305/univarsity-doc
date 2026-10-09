import {
  type AuthUser,
  authUserSchema,
  type StudentMe,
  studentMeSchema,
  type StudentCurriculum,
  studentCurriculumSchema,
  type StudentProfileRequest,
  studentProfileRequestListSchema,
} from '@docversity/validation';
import { cookies } from 'next/headers';
import { cache } from 'react';
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

const STUDENT_COOKIES = ['dv_student', '__Host-dv_student'];

export type StudentSessionState =
  { status: 'authenticated'; me: StudentMe } | { status: 'anonymous' } | { status: 'unavailable' };

/**
 * The signed-in STUDENT (student portal pages). Only the student cookie matters here; a staff
 * session is irrelevant to the portal. The API enforces ownership on every request regardless.
 */
export const getStudentSessionState = cache(async (): Promise<StudentSessionState> => {
  const jar = await cookies();
  if (!STUDENT_COOKIES.some((name) => jar.has(name))) return { status: 'anonymous' };
  const { API_INTERNAL_URL } = loadWebEnv();
  try {
    const response = await fetch(new URL('/api/v1/student/me', API_INTERNAL_URL), {
      headers: { cookie: jar.toString(), accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
    if (response.status === 401) return { status: 'anonymous' };
    if (!response.ok) return { status: 'unavailable' };
    const parsed = studentMeSchema.safeParse(await response.json());
    return parsed.success
      ? { status: 'authenticated', me: parsed.data }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
});

/**
 * The signed-in student's own profile change requests (server-rendered portal pages), or `null`
 * when the API cannot answer. Ownership is enforced by the API from the student session.
 */
export const getStudentProfileRequests = cache(
  async (): Promise<StudentProfileRequest[] | null> => {
    const jar = await cookies();
    if (!STUDENT_COOKIES.some((name) => jar.has(name))) return null;
    const { API_INTERNAL_URL } = loadWebEnv();
    try {
      const response = await fetch(new URL('/api/v1/student/profile-requests', API_INTERNAL_URL), {
        headers: { cookie: jar.toString(), accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) return null;
      const parsed = studentProfileRequestListSchema.safeParse(await response.json());
      return parsed.success ? parsed.data.data : null;
    } catch {
      return null;
    }
  },
);

/** The signed-in student's assigned curricula (Course Details), or `null` when unavailable. */
export const getStudentCurriculum = cache(async (): Promise<StudentCurriculum | null> => {
  const jar = await cookies();
  if (!STUDENT_COOKIES.some((name) => jar.has(name))) return null;
  const { API_INTERNAL_URL } = loadWebEnv();
  try {
    const response = await fetch(new URL('/api/v1/student/curriculum', API_INTERNAL_URL), {
      headers: { cookie: jar.toString(), accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return null;
    const parsed = studentCurriculumSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
});
