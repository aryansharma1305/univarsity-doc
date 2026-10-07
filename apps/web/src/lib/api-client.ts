/**
 * Browser-side calls to the API through the same-origin proxy. Every unsafe request first obtains
 * a CSRF token from GET /api/v1/auth/csrf and sends it as X-CSRF-Token. Cookies are HttpOnly and
 * handled entirely by the browser — nothing is stored in localStorage or readable by JavaScript.
 */
export interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

export async function fetchCsrfToken(): Promise<string> {
  const response = await fetch('/api/v1/auth/csrf', {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Could not start a secure session. Please try again.');
  const body = (await response.json()) as { csrfToken?: string };
  if (!body.csrfToken) throw new Error('Could not start a secure session. Please try again.');
  return body.csrfToken;
}

export async function postJson(path: `/api/v1/${string}`, body?: unknown): Promise<Response> {
  const csrfToken = await fetchCsrfToken();
  return fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}
