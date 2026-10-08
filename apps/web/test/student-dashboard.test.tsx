// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StudentMe } from '@docversity/validation';
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
    expect(screen.getByText('Results are not available yet')).toBeInTheDocument();
    expect(screen.getByText('Documents are not available yet')).toBeInTheDocument();
    expect(screen.getByText('No activity available')).toBeInTheDocument();
    expect(screen.queryByText(/65%|Rahul|WhatsApp|SGPA|CGPA/)).not.toBeInTheDocument();
  });

  it('handles no registrations and reports unavailable photos without fetching storage', () => {
    render(<StudentOverview me={{ ...me, registrations: [] }} />);
    expect(screen.getByText('No registration is linked to your account.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows missing DOB/photo and gives no edit control or submission form', () => {
    render(<StudentProfile me={me} />);
    expect(screen.getByText('Photo: Not on record. Initials shown instead.')).toBeInTheDocument();
    expect(screen.getByText('Official records are read-only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit|Submit/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('Not on record').length).toBeGreaterThan(0);
  });

  it('shows only real course fields and formats the account activation timestamp', () => {
    const view = render(<StudentCourses me={me} />);
    expect(screen.getByText('TEST-P')).toBeInTheDocument();
    expect(screen.queryByText(/Progress|Grade|Next exam/)).not.toBeInTheDocument();
    view.rerender(<StudentSettings me={me} />);
    expect(screen.getByText('09 Oct 2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Change password/ })).not.toBeInTheDocument();
  });

  it.each(['results', 'documents', 'notifications'] as const)(
    'marks %s as planned without download actions',
    (module) => {
      render(<StudentUnavailable module={module} />);
      expect(screen.getByText(/are not available yet/)).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Download|Print/ })).not.toBeInTheDocument();
    },
  );
});
