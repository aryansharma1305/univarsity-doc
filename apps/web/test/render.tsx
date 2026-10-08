import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import type { AuthUser } from '@docversity/validation';
import { SessionProvider } from '@/components/providers/session-context';

export const VIEWER: AuthUser = {
  id: '01900000-0000-7000-8000-000000000001',
  email: 'viewer@example.test',
  displayName: 'Viewer',
  roles: ['VIEWER'],
  permissions: [
    'departments.read',
    'programs.read',
    'academicSessions.read',
    'students.read',
    'registrations.read',
  ],
};

export const REGISTRAR: AuthUser = {
  ...VIEWER,
  roles: ['REGISTRAR'],
  permissions: [
    ...VIEWER.permissions,
    'departments.write',
    'programs.write',
    'academicSessions.write',
    'students.write',
    'registrations.write',
  ],
};

export function renderWithProviders(ui: ReactNode, user: AuthUser = REGISTRAR) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SessionProvider user={user}>{ui}</SessionProvider>
    </QueryClientProvider>,
  );
}

/** Mocks fetch with a handler per "METHOD path" (component tests only — never the real API). */
export function mockFetch(
  handler: (method: string, path: string, body: unknown) => { status?: number; body: unknown },
) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, 'http://localhost');
    const method = init?.method ?? 'GET';
    if (url.pathname === '/api/v1/auth/csrf')
      return Promise.resolve(Response.json({ csrfToken: 'test-token' }));
    const result = handler(
      method,
      url.pathname.replace('/api/v1/', ''),
      typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    );
    return Promise.resolve(Response.json(result.body, { status: result.status ?? 200 }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export const EMPTY_PAGE = { data: [], meta: { page: 1, pageSize: 25, total: 0, totalPages: 0 } };
