// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StudentMe, StudentReExamApplication } from '@docversity/validation';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/student/profile',
}));
import { StudentOverview } from '@/features/student-portal/student-overview';
import {
  StudentCourses,
  StudentProfile,
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
  it('shows the authenticated records with unavailable services, without invented data', () => {
    render(<StudentOverview me={me} />);
    expect(screen.getByRole('heading', { name: 'Welcome, Test Student One' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'TEST-REG-1' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Quick actions' })).toBeInTheDocument();
    expect(screen.getByText('Only published results appear in My Results')).toBeInTheDocument();
    // Phase 8: documents are real; with none published the card says so honestly.
    expect(screen.getByText('No documents published yet')).toBeInTheDocument();
    // Recent activity lists exactly one real event: the stored activation timestamp.
    const activity = screen.getByRole('list', { name: 'Recent activity' });
    expect(activity.querySelectorAll('li')).toHaveLength(1);
    expect(activity).toHaveTextContent('Student account activated');
    expect(activity.querySelector('time')).toHaveAttribute('datetime', me.account.activatedAt);
    expect(screen.queryByText('No activity available')).not.toBeInTheDocument();
    // Planned quick actions carry a "Soon" label; working ones do not.
    expect(screen.getByRole('link', { name: /^My Results$/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /My Documents/ })).not.toHaveTextContent('Soon');
    expect(screen.getByRole('link', { name: /My Profile/ })).not.toHaveTextContent('Soon');
    expect(screen.queryByText(/65%|Rahul|WhatsApp|SGPA|CGPA/)).not.toBeInTheDocument();
  });

  it('keeps an approved application separate from its unverified payment', () => {
    const application: StudentReExamApplication = {
      id: '01900000-0000-7000-8000-000000000010',
      reference: 'TEST-APP-1',
      status: 'APPROVED',
      submittedAt: '2026-10-09T10:00:00.000Z',
      registrationNumber: 'TEST-REG-1',
      programName: 'Test Program',
      academicSessionName: 'Test Session',
      periodLabel: 'Year 1',
      examinationName: 'Test Re-exam',
      examSession: 'Test exam session',
      subject: { code: 'TEST-SUB', name: 'Test subject' },
      attemptNumber: 2,
      decidedAt: null,
      decisionReason: null,
      cancelledAt: null,
      history: [],
      fee: {
        status: 'NOT_CONFIGURED',
        blockedReason: null,
        amountMinor: null,
        currency: null,
        scope: null,
        ruleVersion: null,
        assessedAt: null,
      },
      payment: {
        id: '01900000-0000-7000-8000-000000000011',
        status: 'SUBMITTED',
        region: 'INDIA',
        amountMinor: 100,
        currency: 'INR',
        submittedAt: '2026-10-09T10:00:00.000Z',
        reviewedAt: null,
      },
    };
    render(<StudentOverview me={me} applications={[application]} />);
    const status = screen.getByRole('list', { name: 'Re-exam application status' });
    expect(status).toHaveTextContent('Application:Approved');
    expect(status).toHaveTextContent('Payment:');
    expect(status).toHaveTextContent('Submitted');
    expect(status).not.toHaveTextContent('Verified');
    expect(status).not.toHaveTextContent('Result');
  });

  it('keeps unavailable dashboard sources distinct from empty records', () => {
    render(<StudentOverview me={me} requests={null} documents={null} applications={null} />);
    expect(screen.getByText(/Profile requests could not be loaded/)).toBeInTheDocument();
    expect(screen.getByText(/Documents could not be loaded/)).toBeInTheDocument();
    expect(screen.getByText(/Re-exam applications could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByText('No documents published yet')).not.toBeInTheDocument();
    expect(screen.queryByText('No re-exam applications yet.')).not.toBeInTheDocument();
    expect(screen.queryByText('No profile update is waiting for review.')).not.toBeInTheDocument();
  });

  it('offers only existing student destinations and never infers a current period', () => {
    render(<StudentOverview me={me} />);
    expect(screen.getByRole('link', { name: /Re-exam applications/ })).toHaveAttribute(
      'href',
      '/student/examinations/re-exam/applications',
    );
    expect(screen.getByRole('link', { name: /My Course/ })).toHaveAttribute(
      'href',
      '/student/course',
    );
    expect(
      screen.queryByText(/Current semester|Current year|Attendance|CGPA/),
    ).not.toBeInTheDocument();
  });

  it('keeps the honest empty state when no activation timestamp is stored', () => {
    render(<StudentOverview me={{ ...me, account: { ...me.account, activatedAt: '' } }} />);
    expect(screen.getByText('No activity available')).toBeInTheDocument();
    expect(screen.queryByText('Student account activated')).not.toBeInTheDocument();
  });

  it('handles no registrations and reports unavailable photos without fetching storage', () => {
    render(<StudentOverview me={{ ...me, registrations: [] }} />);
    expect(screen.getByText('No registration is linked to your account.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows missing DOB/photo; official details are never edited directly, only requested', () => {
    render(<StudentProfile me={me} requests={[]} />);
    expect(screen.getByText('Photo: Not on record. Initials shown instead.')).toBeInTheDocument();
    expect(screen.getByText('Official records are read-only')).toBeInTheDocument();
    // No direct edit or one-click submit: changes go through a review step to an approval request.
    expect(screen.queryByRole('button', { name: /^Edit|Submit/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review changes' })).toBeInTheDocument();
    expect(screen.getByLabelText('Date of birth')).toHaveAttribute('type', 'date');
    expect(screen.getAllByText('Not on record').length).toBeGreaterThan(0);
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
    const view = render(<StudentProfile me={me} requests={[pending]} />);
    expect(screen.queryByRole('button', { name: 'Review changes' })).not.toBeInTheDocument();
    expect(screen.getByText('Pending review')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel request' })).toBeInTheDocument();
    view.rerender(<StudentProfile me={me} requests={null} />);
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
