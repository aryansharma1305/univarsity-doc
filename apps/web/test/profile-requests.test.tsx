// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AuthUser,
  ProfileRequestDetail,
  StudentMe,
  StudentProfileRequest,
} from '@docversity/validation';
import { ProfileRequestDetailView } from '@/features/profile-requests/profile-request-detail-view';
import { ProfileRequestCard } from '@/features/student-portal/profile-requests';
import { ProfileUpdateForm } from '@/features/student-portal/profile-update';
import { REGISTRAR, VIEWER, mockFetch, renderWithProviders } from './render';

const refresh = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push }),
  usePathname: () => '/student/profile',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockReset();
  push.mockReset();
});

const me: StudentMe = {
  account: {
    id: '01900000-0000-7000-8000-000000000001',
    status: 'ACTIVE',
    activatedAt: '2026-10-09T09:30:00.000Z',
  },
  student: {
    id: '01900000-0000-7000-8000-000000000002',
    fullName: 'Test Student One',
    fatherName: null,
    motherName: null,
    dateOfBirth: null,
    gender: null,
    hasPhoto: false,
  },
  registrations: [],
};

const submitted: StudentProfileRequest = {
  id: '01900000-0000-7000-8000-0000000000aa',
  status: 'PENDING',
  submittedAt: '2026-10-09T10:00:00.000Z',
  decidedAt: null,
  changes: [{ field: 'dateOfBirth', previous: null, proposed: '2001-04-05' }],
  photo: null,
  note: null,
  rejectionReason: null,
};

/** fetch stub that records multipart submissions (FormData) and JSON bodies. */
function stubPortalFetch(respond: (path: string) => { status?: number; body: unknown }) {
  const forms: FormData[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(href, 'http://localhost').pathname.replace('/api/v1/', '');
    if (init?.body instanceof FormData) forms.push(init.body);
    if (path === 'student-auth/csrf') return Promise.resolve(Response.json({ csrfToken: 's' }));
    const result = respond(path);
    return Promise.resolve(Response.json(result.body, { status: result.status ?? 200 }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, forms };
}

describe('student profile update form', () => {
  it('previews the changes, then submits only changed fields with the student CSRF token', async () => {
    const { fetchMock, forms } = stubPortalFetch(() => ({ status: 201, body: submitted }));
    renderWithProviders(<ProfileUpdateForm me={me} />);
    await userEvent.type(screen.getByLabelText('Date of birth'), '2001-04-05');
    await userEvent.selectOptions(screen.getByLabelText('Gender'), 'Female');
    await userEvent.click(screen.getByRole('button', { name: 'Review changes' }));

    const table = screen.getByRole('table', { name: 'Proposed changes' });
    expect(within(table).getByRole('rowheader', { name: 'Date of birth' })).toBeInTheDocument();
    expect(within(table).getByText('05 Apr 2001')).toBeInTheDocument();
    expect(within(table).getByText('Female')).toBeInTheDocument();
    expect(within(table).queryByText('Full name')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/student/profile/requests?submitted=1');
    });
    expect(forms).toHaveLength(1);
    expect(JSON.parse(forms[0]?.get('changes') as string)).toEqual({
      dateOfBirth: '2001-04-05',
      gender: 'Female',
    });
    const call = fetchMock.mock.calls.find(
      ([url]) => typeof url === 'string' && url.includes('profile-requests'),
    );
    expect(new Headers(call?.[1]?.headers).get('X-CSRF-Token')).toBe('s');
  });

  it('validates before review and never sends an empty request', async () => {
    const { fetchMock } = stubPortalFetch(() => ({ body: submitted }));
    renderWithProviders(<ProfileUpdateForm me={me} />);
    await userEvent.click(screen.getByRole('button', { name: 'Review changes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Change at least one detail');
    await userEvent.type(screen.getByLabelText('Date of birth'), '2099-01-01');
    await userEvent.click(screen.getByRole('button', { name: 'Review changes' }));
    expect(await screen.findByText(/Enter a date of birth between/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses unsupported or oversized photos in the browser', async () => {
    stubPortalFetch(() => ({ body: submitted }));
    renderWithProviders(<ProfileUpdateForm me={me} />);
    const input = screen.getByLabelText('Photo');
    await userEvent.upload(input, new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }), {
      applyAccept: false,
    });
    expect(screen.getByText('Choose a JPEG, PNG or WebP photo.')).toBeInTheDocument();
    await userEvent.upload(
      input,
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' }),
    );
    expect(screen.getByText('Choose a photo under 5 MB.')).toBeInTheDocument();
  });

  it('returns to editing with the API’s field error (e.g. a pending request conflict)', async () => {
    stubPortalFetch(() => ({
      status: 400,
      body: {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request is invalid.',
          requestId: 'r',
          details: [
            { path: 'changes.gender', message: 'Gender is already this value on your record.' },
          ],
        },
      },
    }));
    renderWithProviders(<ProfileUpdateForm me={me} />);
    await userEvent.selectOptions(screen.getByLabelText('Gender'), 'Male');
    await userEvent.click(screen.getByRole('button', { name: 'Review changes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit for approval' }));
    expect(
      await screen.findByText('Gender is already this value on your record.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review changes' })).toBeInTheDocument();
  });
});

describe('student request card', () => {
  it('shows the rejection reason and offers no actions on decided requests', () => {
    renderWithProviders(
      <ProfileRequestCard
        request={{
          ...submitted,
          status: 'REJECTED',
          decidedAt: '2026-10-10T10:00:00.000Z',
          rejectionReason: 'Please attach your birth certificate.',
        }}
      />,
    );
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.getByText('Please attach your birth certificate.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('cancels a pending request after confirmation', async () => {
    const paths: string[] = [];
    stubPortalFetch((path) => {
      paths.push(path);
      return { body: { ...submitted, status: 'CANCELLED', decidedAt: submitted.submittedAt } };
    });
    renderWithProviders(<ProfileRequestCard request={submitted} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel request' }));
    await waitFor(() => {
      expect(refresh).toHaveBeenCalled();
    });
    expect(paths).toEqual([`student/profile-requests/${submitted.id}/cancel`]);
  });
});

const detail: ProfileRequestDetail = {
  id: submitted.id,
  status: 'PENDING',
  submittedAt: submitted.submittedAt,
  reviewedAt: null,
  cancelledAt: null,
  student: { id: me.student.id, fullName: 'Test Student One' },
  registrationNumbers: ['TEST-REG-1'],
  fields: ['fullName'],
  hasPhoto: false,
  reviewer: null,
  changes: [
    {
      field: 'fullName',
      previous: 'Test Student One',
      proposed: 'Test Student Corrected',
      current: 'Test Student One',
      changedSinceSubmission: false,
    },
  ],
  photo: null,
  hasOfficialPhoto: false,
  stale: false,
  note: 'As on my admission letter.',
  rejectionReason: null,
  history: [
    {
      id: '01900000-0000-7000-8000-0000000000bb',
      action: 'STUDENT_PROFILE_REQUEST_SUBMITTED',
      summary: 'Submitted by the student',
      actor: 'Student',
      createdAt: submitted.submittedAt,
    },
  ],
  otherRequests: [],
};

const REVIEWER: AuthUser = {
  ...REGISTRAR,
  permissions: [
    ...REGISTRAR.permissions,
    'studentProfileRequests.read',
    'studentProfileRequests.review',
  ],
};

describe('admin profile request review', () => {
  it('compares values and requires a reason to reject', async () => {
    const bodies: unknown[] = [];
    mockFetch((method, path, body) => {
      if (method === 'POST') {
        bodies.push({ path, body });
        return { body: { ...detail, status: 'REJECTED', rejectionReason: 'Name mismatch found.' } };
      }
      return { body: detail };
    });
    renderWithProviders(<ProfileRequestDetailView requestId={detail.id} />, REVIEWER);
    const table = await screen.findByRole('table', {
      name: 'Requested changes compared with the official record',
    });
    expect(within(table).getByText('Test Student Corrected')).toBeInTheDocument();
    expect(screen.getByText('As on my admission letter.')).toBeInTheDocument();
    expect(screen.getByText('Submitted by the student')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Reject request' });
    expect(confirm).toBeDisabled();
    await userEvent.type(
      within(dialog).getByLabelText('Reason (shown to the student)'),
      'Name mismatch found.',
    );
    await userEvent.click(confirm);
    await waitFor(() => {
      expect(bodies).toEqual([
        { path: `profile-requests/${detail.id}/reject`, body: { reason: 'Name mismatch found.' } },
      ]);
    });
  });

  it('blocks approval of a stale request and explains why', async () => {
    mockFetch(() => ({
      body: {
        ...detail,
        stale: true,
        changes: [
          { ...detail.changes[0], current: 'Registrar Corrected', changedSinceSubmission: true },
        ],
      },
    }));
    renderWithProviders(<ProfileRequestDetailView requestId={detail.id} />, REVIEWER);
    expect(await screen.findByText(/changed after this was submitted/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    const table = screen.getByRole('table', {
      name: 'Requested changes compared with the official record',
    });
    expect(within(table).getByText('Changed since submission')).toBeInTheDocument();
    expect(within(table).getByText('Registrar Corrected')).toBeInTheDocument();
  });

  it('shows no decision controls without the review permission', async () => {
    mockFetch(() => ({ body: detail }));
    renderWithProviders(<ProfileRequestDetailView requestId={detail.id} />, {
      ...VIEWER,
      permissions: [...VIEWER.permissions, 'studentProfileRequests.read'],
    });
    expect(
      await screen.findByText(/you can view this request but not decide it/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });
});
