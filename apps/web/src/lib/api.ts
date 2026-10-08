import { errorResponseSchema } from '@docversity/validation';
import type { z } from 'zod';

/**
 * Typed browser client for the Docversity API (same-origin `/api/v1`, proxied by Next.js).
 * - Cookies are HttpOnly and sent automatically; nothing auth-related is stored by JavaScript.
 * - Unsafe methods send `X-CSRF-Token` (fetched once from /auth/csrf, refreshed on CSRF_INVALID).
 * - Responses are validated with the shared Zod schemas.
 * - Failures become ApiError with the API's safe message, code and field details.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: { path: string; message: string }[] = [],
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isForbidden(): boolean {
    return this.status === 403 && this.code === 'FORBIDDEN';
  }
  get isNotFound(): boolean {
    return this.status === 404;
  }
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}

type Query = Record<string, string | number | undefined | null>;

let csrfToken: string | undefined;

async function getCsrfToken(refresh = false): Promise<string> {
  if (!csrfToken || refresh) {
    const response = await fetch('/api/v1/auth/csrf', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const body = (await response.json()) as { csrfToken?: string };
    if (!response.ok || !body.csrfToken) {
      throw new ApiError(
        response.status,
        'CSRF_UNAVAILABLE',
        'Could not start a secure request. Please retry.',
      );
    }
    csrfToken = body.csrfToken;
  }
  return csrfToken;
}

/** Clears cached request state (call after sign-in/out). */
export function resetApiClient(): void {
  csrfToken = undefined;
}

function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const search = params.toString();
  return `/api/v1/${path}${search ? `?${search}` : ''}`;
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const parsed = errorResponseSchema.safeParse(await response.json());
    if (parsed.success) {
      const { code, message, details, requestId } = parsed.data.error;
      return new ApiError(response.status, code, message, details ?? [], requestId);
    }
  } catch {
    // fall through
  }
  return new ApiError(
    response.status,
    'UNEXPECTED_RESPONSE',
    'The server returned an unexpected response.',
  );
}

export async function apiRequest<TSchema extends z.ZodType>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  schema: TSchema,
  options: { query?: Query; body?: unknown } = {},
): Promise<z.infer<TSchema>> {
  const send = async (refreshCsrf: boolean) => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      headers['X-CSRF-Token'] = await getCsrfToken(refreshCsrf);
    }
    return fetch(buildUrl(path, options.query), {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  };

  let response: Response;
  try {
    response = await send(false);
    if (response.status === 403 && method !== 'GET') {
      const error = await toApiError(response.clone());
      if (error.code === 'CSRF_INVALID') response = await send(true); // session rotated — retry once
    }
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Could not reach the server. Check your connection and try again.',
    );
  }

  if (!response.ok) throw await toApiError(response);
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError(
      response.status,
      'UNEXPECTED_RESPONSE',
      'The server returned an unexpected response.',
    );
  }
  return parsed.data;
}

/**
 * Uploads a file (multipart/form-data) with the session's CSRF token. The browser sets the
 * multipart boundary itself, so no Content-Type is sent explicitly.
 */
export async function apiUpload<TSchema extends z.ZodType>(
  path: string,
  form: FormData,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  const send = async (refreshCsrf: boolean) =>
    fetch(buildUrl(path), {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'X-CSRF-Token': await getCsrfToken(refreshCsrf) },
      body: form,
    });
  let response: Response;
  try {
    response = await send(false);
    if (response.status === 403) {
      const error = await toApiError(response.clone());
      if (error.code === 'CSRF_INVALID') response = await send(true);
    }
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Could not reach the server. Check your connection and try again.',
    );
  }
  if (!response.ok) throw await toApiError(response);
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError(
      response.status,
      'UNEXPECTED_RESPONSE',
      'The server returned an unexpected response.',
    );
  }
  return parsed.data;
}

/**
 * Downloads a private file (template, error report) through the authenticated API and hands it to
 * the browser as a file. Nothing is cached; the object URL is revoked right away.
 */
export async function apiDownload(path: string, fallbackName: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(buildUrl(path), { credentials: 'same-origin', cache: 'no-store' });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Could not reach the server. Check your connection and try again.',
    );
  }
  if (!response.ok) throw await toApiError(response);
  const disposition = response.headers.get('content-disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** User-facing message for any thrown error. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}
