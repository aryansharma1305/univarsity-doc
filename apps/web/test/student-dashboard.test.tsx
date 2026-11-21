// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StudentMe } from '@docversity/validation';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/student/profile',
}));
import { StudentOverview } from '@/features/student-portal/student-overview';
import { STUDENT_NAV } from '@/features/student-portal/nav';
import {
  ProfileRequestList,
  StudentCourses,
  StudentProfile,
  StudentProfileUpdate,
  StudentSettings,
  StudentUnavailable,
} from '@/features/student-portal/student-pages';

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
  registrations: [
    {
      id: '01900000-0000-7000-8000-000000000003',
      registrationNumber: 'TEST-REG-1',
      rollReferenceNumber: null,
      program: { id: '01900000-0000-7000-8000-000000000004', code: 'TEST-P', name: 'Test Program' },
      department: null,
      academicSession: {
        id: '01900000-0000-7000-8000-000000000005',
        code: 'TEST-S',
        name: 'Test Session',
      },
      admissionDate: null,
      completionDate: null,
      status: 'ACTIVE',
    },
  ],
};

describe('student dashboard and read-only pages', () => {
  it('shows the authenticated records and quick actions, without invented data', () => {
    render(<StudentOverview me={me} />);
    expect(screen.getByRole('heading', { name: 'Welcome, Test Student One' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'TEST-REG-1' })).toBeInTheDocument();
    const actions = screen.getByRole('navigation', { name: 'Quick actions' });
    expect(
      within(actions)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      '/student/profile',
      '/student/requests',
      '/student/examinations',
      '/student/documents',
    ]);
    expect(screen.getByRole('link', { name: /My Documents/ })).not.toHaveTextContent('Soon');
    expect(screen.getByRole('link', { name: /My Profile/ })).not.toHaveTextContent('Soon');
    expect(screen.queryByText(/65%|Rahul|WhatsApp|SGPA|CGPA/)).not.toBeInTheDocument();
  });

  it('keeps the dashboard simple: no recent activity, request card or second documents option', () => {
    render(<StudentOverview me={me} />);
    expect(screen.queryByRole('heading', { name: /Recent activity/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'My requests' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Documents' })).not.toBeInTheDocument();
    expect(screen.queryByText('Student account activated')).not.toBeInTheDocument();
    // Exactly one way to My Documents from the dashboard.
    expect(
      screen
        .getAllByRole('link')
        .filter((link) => link.getAttribute('href') === '/student/documents'),
    ).toHaveLength(1);
  });

  it('lists profile requests under My Requests with honest unavailable and empty states', () => {
    const view = render(<ProfileRequestList requests={null} />);
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
    view.rerender(<ProfileRequestList requests={[]} />);
    expect(screen.getByText('No requests yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Update my details' })).toHaveAttribute(
      'href',
      '/student/profile/update',
    );
    expect(STUDENT_NAV.map((item) => item.label)).toContain('My Requests');
    expect(STUDENT_NAV.map((item) => item.label)).not.toContain('Course Details');
  });

  it('lists the requested sub-items under My Profile, Examinations and Results only', () => {
    const children = Object.fromEntries(
      STUDENT_NAV.map((item) => [item.label, item.children?.map((child) => child.label) ?? []]),
    );
    expect(children['My Profile']).toEqual(['Course Details', 'Update My Details']);
    expect(children.Examinations).toEqual([
      'Apply for Exam',
      'Apply for Re-exam',
      'Login to Exam Panel',
    ]);
    expect(children.Results).toEqual(['View Result']);
    expect(STUDENT_NAV.filter((item) => item.children).map((item) => item.label)).toEqual([
      'My Profile',
      'Examinations',
      'Results',
    ]);
  });

  it('offers only existing student destinations and never infers a current period', () => {
    render(
      <StudentOverview
        me={{
          ...me,
          registrations: [
            ...me.registrations,
            ...me.registrations.map((r) => ({ ...r, id: '01900000-0000-7000-8000-0000000000ff' })),
          ],
        }}
      />,
    );
    expect(screen.getByRole('link', { name: /View all 2 registrations/ })).toHaveAttribute(
      'href',
      '/student/profile#course-details',
    );
    expect(
      screen.queryByText(/Current semester|Current year|Attendance|CGPA/),
    ).not.toBeInTheDocument();
  });

  it('handles no registrations and reports unavailable photos without fetching storage', () => {
    render(<StudentOverview me={{ ...me, registrations: [] }} />);
    expect(screen.getByText('No registration is linked to your account.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows the profile and course details read-only, with Update My Details as the only way in', () => {
    render(<StudentProfile me={me} />);
    expect(screen.getByText('Photo: Not on record. Initials shown instead.')).toBeInTheDocument();
    expect(screen.getByText('Official records are read-only')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Update My Details' })).toHaveAttribute(
      'href',
      '/student/profile/update',
    );
    // The correction form is not on the profile page itself.
    expect(screen.queryByRole('button', { name: 'Review changes' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Date of birth')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Course Details' })).toBeInTheDocument();
    expect(screen.getByText('TEST-P')).toBeInTheDocument();
    expect(screen.getAllByText('Not on record').length).toBeGreaterThan(0);
  });

  it('shows the existing request form after Update My Details; never a direct edit', () => {
    render(<StudentProfileUpdate me={me} requests={[]} />);
    expect(screen.queryByRole('button', { name: /^Edit|Submit/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review changes' })).toBeInTheDocument();
    expect(screen.getByLabelText('Date of birth')).toHaveAttribute('type', 'date');
    expect(screen.getByRole('link', { name: 'Back to My Profile' })).toHaveAttribute(
      'href',
      '/student/profile',
    );
  });

  it('shows the pending request instead of a new form, and an error when requests cannot load', () => {
    const pending = {
      id: '01900000-0000-7000-8000-0000000000aa',
      status: 'PENDING' as const,
      submittedAt: '2026-10-09T10:00:00.000Z',
      decidedAt: null,
      changes: [{ field: 'dateOfBirth' as const, previous: null, proposed: '2001-04-05' }],
      photo: null,
      note: null,
      rejectionReason: null,
    };
    const view = render(<StudentProfileUpdate me={me} requests={[pending]} />);
    expect(screen.queryByRole('button', { name: 'Review changes' })).not.toBeInTheDocument();
    expect(screen.getByText('Pending review')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel request' })).toBeInTheDocument();
    view.rerender(<StudentProfileUpdate me={me} requests={null} />);
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
    expect(screen.queryByRole('button', { name: 'Review changes' })).not.toBeInTheDocument();
  });

  it('shows only real course fields and formats the account activation timestamp', () => {
    const view = render(<StudentCourses me={me} />);
    expect(screen.getByText('TEST-P')).toBeInTheDocument();
    expect(screen.queryByText(/Progress|Grade|Next exam/)).not.toBeInTheDocument();
    view.rerender(<StudentSettings me={me} />);
    expect(screen.getByText('09 Oct 2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Change password/ })).not.toBeInTheDocument();
  });

  it.each(['results', 'notifications'] as const)(
    'marks %s as planned without download actions',
    (module) => {
      render(<StudentUnavailable module={module} />);
      expect(screen.getByText(/are not available yet/)).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Download|Print/ })).not.toBeInTheDocument();
    },
  );
});
