// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@docversity/validation';
import { resetApiClient } from '@/lib/api';
import { EMPTY_PAGE, mockFetch, REGISTRAR, renderWithProviders } from './render';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/student/messages',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));
import { StaffThreadView } from '@/features/communication/staff-views';
import { StudentMessages, StudentNotifications } from '@/features/communication/student-views';
import { PublicVerificationQuery } from '@/features/communication/public-query';

afterEach(() => {
  vi.unstubAllGlobals();
  resetApiClient();
  push.mockReset();
});

const THREAD = '01900000-0000-7000-8000-0000000000a1';
const NOTE = {
  id: '01900000-0000-7000-8000-0000000000b1',
  type: 'MESSAGE_REPLY',
  title: 'New reply from the university',
  body: 'The administration replied to your message.',
  link: `/student/messages/${THREAD}`,
  readAt: null,
  createdAt: '2026-11-22T10:00:00.000Z',
};
const thread = (status: 'OPEN' | 'RESOLVED') => ({
  id: THREAD,
  subject: 'Synthetic transcript question',
  status,
  unread: false,
  lastMessageAt: '2026-11-22T10:00:00.000Z',
  createdAt: '2026-11-22T09:00:00.000Z',
  student: {
    id: '01900000-0000-7000-8000-0000000000c1',
    fullName: 'Synthetic Student',
    registrationNumber: 'SYN-1',
  },
  messages: [
    {
      id: '01900000-0000-7000-8000-0000000000d1',
      author: 'STUDENT',
      authorName: 'Synthetic Student',
      body: '<b>not html</b>',
      createdAt: '2026-11-22T09:00:00.000Z',
    },
  ],
});
const withCsrf =
  (handler: (method: string, path: string, body: unknown) => { status?: number; body: unknown }) =>
  (method: string, path: string, body: unknown) =>
    path === 'student-auth/csrf'
      ? { body: { csrfToken: 'student-token' } }
      : handler(method, path, body);

describe('student notifications', () => {
  it('lists own notifications, opens and marks them read', async () => {
    const calls: string[] = [];
    mockFetch(
      withCsrf((method, path) => {
        calls.push(`${method} ${path}`);
        if (path === 'student/notifications')
          return {
            body: {
              ...EMPTY_PAGE,
              data: [NOTE],
              meta: { ...EMPTY_PAGE.meta, total: 1, totalPages: 1 },
            },
          };
        if (path.endsWith('/read'))
          return { body: { ...NOTE, readAt: '2026-11-22T11:00:00.000Z' } };
        return { body: { unread: 0 } };
      }),
    );
    renderWithProviders(<StudentNotifications />);
    expect(await screen.findByText('New reply from the university')).toBeInTheDocument();
    expect(screen.getByText('Unread')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      `/student/messages/${THREAD}`,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }));
    await waitFor(() => {
      expect(calls).toContain(`POST student/notifications/${NOTE.id}/read`);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    await waitFor(() => {
      expect(calls).toContain('POST student/notifications/read-all');
    });
  });

  it('explains the empty state and that nothing is sent by email or SMS', async () => {
    mockFetch(withCsrf(() => ({ body: EMPTY_PAGE })));
    renderWithProviders(<StudentNotifications />);
    expect(await screen.findByText('No notifications yet')).toBeInTheDocument();
    expect(screen.getByText(/nothing is sent by email or SMS/)).toBeInTheDocument();
  });
});

describe('student messages', () => {
  it('starts a conversation through the student session and opens it', async () => {
    let sent: unknown;
    mockFetch(
      withCsrf((method, path, body) => {
        if (method === 'POST' && path === 'student/messages') {
          sent = body;
          return { status: 201, body: thread('OPEN') };
        }
        return { body: EMPTY_PAGE };
      }),
    );
    renderWithProviders(<StudentMessages />);
    expect(await screen.findByText('No messages yet')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Synthetic question' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/student/messages/${THREAD}`);
    });
    expect(sent).toEqual({ subject: 'Synthetic question', body: 'Hello' });
  });
});

describe('staff conversation', () => {
  const RESPONDER: AuthUser = {
    ...REGISTRAR,
    permissions: [...REGISTRAR.permissions, 'studentMessages.read', 'studentMessages.respond'],
  };

  it('renders message text as text and lets responders resolve; a resolved thread blocks replies', async () => {
    let status: 'OPEN' | 'RESOLVED' = 'OPEN';
    mockFetch((method, path) => {
      if (method === 'POST' && path === `messages/${THREAD}/resolve`) status = 'RESOLVED';
      return { body: thread(status) };
    });
    renderWithProviders(<StaffThreadView threadId={THREAD} />, RESPONDER);
    const list = await screen.findByRole('list', { name: 'Messages' });
    expect(within(list).getByText('<b>not html</b>')).toBeInTheDocument();
    expect(screen.getByLabelText('Your reply')).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Mark resolved' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reopen' })).toBeInTheDocument());
    expect(screen.getByLabelText('Your reply')).toBeDisabled();
    expect(screen.getByText('Reopen this conversation to reply.')).toBeInTheDocument();
  });

  it('hides reply and status controls without studentMessages.respond', async () => {
    mockFetch(() => ({ body: thread('OPEN') }));
    renderWithProviders(<StaffThreadView threadId={THREAD} />, {
      ...REGISTRAR,
      permissions: [...REGISTRAR.permissions, 'studentMessages.read'],
    });
    await screen.findByRole('list', { name: 'Messages' });
    expect(screen.queryByLabelText('Your reply')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark resolved' })).not.toBeInTheDocument();
  });
});

describe('public verification support', () => {
  it('shows the reference and one-time access code, then checks an answer', async () => {
    const calls: { path: string; body: unknown }[] = [];
    mockFetch(
      withCsrf((_method, path, body) => {
        calls.push({ path, body });
        if (path === 'public/verification-queries')
          return {
            status: 201,
            body: {
              reference: 'VQ-7KQ2M9XA',
              accessCode: 'ABCDEFGHJKMNPQRSTVWXYZ01',
              status: 'OPEN',
            },
          };
        return {
          body: {
            id: '01900000-0000-7000-8000-0000000000e1',
            reference: 'VQ-7KQ2M9XA',
            status: 'ANSWERED',
            category: 'HOW_TO_VERIFY',
            documentReference: null,
            message: 'q',
            response: 'Use the certificate QR code.',
            respondedAt: '2026-11-22T12:00:00.000Z',
            createdAt: '2026-11-22T10:00:00.000Z',
          },
        };
      }),
    );
    renderWithProviders(<PublicVerificationQuery />);
    fireEvent.change(screen.getByLabelText('Your name'), {
      target: { value: 'Synthetic Employer' },
    });
    fireEvent.change(screen.getByLabelText('Your question'), {
      target: { value: 'How do we verify?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit query' }));
    expect(await screen.findByText('ABCDEFGHJKMNPQRSTVWXYZ01')).toBeInTheDocument();
    expect(screen.getByText(/shown only once/)).toBeInTheDocument();
    expect(calls.find((c) => c.path === 'public/verification-queries')?.body).toMatchObject({
      requesterName: 'Synthetic Employer',
      organization: null,
      contactEmail: null,
      category: 'HOW_TO_VERIFY',
    });
    fireEvent.change(screen.getByLabelText('Reference'), { target: { value: 'VQ-7KQ2M9XA' } });
    fireEvent.change(screen.getByLabelText('Access code'), {
      target: { value: 'ABCDEFGHJKMNPQRSTVWXYZ01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Use the certificate QR code.')).toBeInTheDocument();
  });

  it('gives one safe message for an unknown reference or wrong code', async () => {
    mockFetch(
      withCsrf(() => ({
        status: 404,
        body: { error: { code: 'NOT_FOUND', message: 'PRIVATE DETAIL', requestId: 'x' } },
      })),
    );
    renderWithProviders(<PublicVerificationQuery />);
    fireEvent.change(screen.getByLabelText('Reference'), { target: { value: 'VQ-00000000' } });
    fireEvent.change(screen.getByLabelText('Access code'), { target: { value: 'WRONG' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No query matches this reference and access code.');
    expect(alert).not.toHaveTextContent('PRIVATE DETAIL');
  });
});
