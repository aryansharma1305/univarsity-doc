// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type AuthUser,
  PAYMENT_REGION_LABELS,
  PAYMENT_REGIONS,
  type PaymentDestinationDetail,
  type PaymentDestinationList,
  type ReExamPaymentDetail,
  type StudentReExamPayment,
  type StudentReExamPaymentView,
} from '@docversity/validation';
import { PaymentDestinationDetailView } from '@/features/re-exam-payments/destination-detail-view';
import { PaymentDestinationsView } from '@/features/re-exam-payments/destinations-view';
import { ReExamPaymentDetailView } from '@/features/re-exam-payments/payment-detail-view';
import { StudentReExamPaymentPage } from '@/features/student-portal/student-re-exam-payment';
import { VIEWER, mockFetch, renderWithProviders } from './render';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/re-exam-payments',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

const APP_ID = '01900000-0000-7000-8000-0000000000a1';
const PAYMENT_ID = '01900000-0000-7000-8000-0000000000c1';

const payment = (overrides: Partial<StudentReExamPayment> = {}): StudentReExamPayment => ({
  id: PAYMENT_ID,
  status: 'AWAITING_PAYMENT',
  region: 'INDIA',
  amountMinor: 100_000,
  currency: 'INR',
  createdAt: '2026-10-10T10:00:00.000Z',
  destination: {
    countryName: null,
    beneficiaryName: 'Synthetic University Fees Account',
    method: 'UPI',
    instructions: 'TEST ONLY: scan the synthetic QR.',
    evidenceRequirement: 'OPTIONAL',
    available: true,
  },
  transactionReference: null,
  submittedAt: null,
  hasEvidence: false,
  reviewedAt: null,
  rejectionReason: null,
  ...overrides,
});

const baseView = (overrides: Partial<StudentReExamPaymentView> = {}): StudentReExamPaymentView => ({
  application: {
    id: APP_ID,
    reference: 'RX-0000-00A1',
    status: 'SUBMITTED',
    studentName: 'Test Student One',
    registrationNumber: 'TEST-REG-1',
    programName: 'Test Program',
    academicSessionName: 'Session 2026',
    examinationName: 'Semester 2 Re-examination',
    examSession: 'Nov 2026',
    periodLabel: 'Semester 2',
    subject: { code: 'SUB-1', name: 'Synthetic Anatomy' },
    attemptNumber: 1,
    attemptBasis: 'NON_REJECTED_RE_EXAM_APPLICATIONS',
  },
  fee: {
    status: 'ASSESSED',
    blockedReason: null,
    amountMinor: 100_000,
    currency: 'INR',
    scope: 'PER_SUBJECT',
    ruleVersion: 1,
    assessedAt: '2026-10-10T09:00:00.000Z',
  },
  unavailableReason: null,
  regions: PAYMENT_REGIONS.map((region) => ({
    region,
    label: PAYMENT_REGION_LABELS[region],
    isGroup: ['EUROPE', 'CENTRAL_ASIA', 'OTHERS'].includes(region),
    available: region === 'INDIA' || region === 'NEPAL',
    unavailableReason: region === 'INDIA' || region === 'NEPAL' ? null : 'NOT_CONFIGURED',
  })),
  current: null,
  previous: [],
  retention: 'Payment records are kept until the university defines a retention period.',
  ...overrides,
});

describe('student Pay Now', () => {
  it('shows the verified identity, all eight choices and disables unconfigured ones', async () => {
    render(<StudentReExamPaymentPage view={baseView()} />);
    expect(screen.getByText('Test Student One')).toBeInTheDocument();
    expect(screen.getByText('Session 2026')).toBeInTheDocument();
    expect(screen.getByText('Re-exam attempt 1 (first re-exam)')).toBeInTheDocument();
    expect(screen.getByText('₹1,000.00 · Per subject (paper)')).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(8);
    expect(screen.getByRole('radio', { name: /^India/ })).toBeEnabled();
    expect(screen.getByRole('radio', { name: /^Pakistan/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /^Europe \(region\)/ })).toBeDisabled();
    expect(
      screen.getAllByText(/has not published payment details for this country or region/),
    ).toHaveLength(6);
    // No QR before a country is chosen; nothing is invented.
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    const show = screen.getByRole('button', { name: 'Show payment details' });
    expect(show).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: /^India/ }));
    expect(show).toBeEnabled();
    expect(screen.getByRole('note')).toHaveTextContent(/Never share a PIN, one-time code/);
  });

  it('shows only the chosen QR with the amount and asks for the transaction reference', async () => {
    render(
      <StudentReExamPaymentPage
        view={baseView({
          current: payment({
            destination: { ...payment().destination, evidenceRequirement: 'REQUIRED' },
          }),
        })}
      />,
    );
    const qr = screen.getByRole('img', { name: /University payment QR code for India/ });
    expect(qr).toHaveAttribute('src', `/api/v1/student/re-exam-payments/${PAYMENT_ID}/qr`);
    expect(screen.getByText('Synthetic University Fees Account')).toBeInTheDocument();
    expect(screen.getByLabelText(/receipt or screenshot \(required/)).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Submit payment details' });
    await userEvent.type(screen.getByLabelText(/Transaction reference/), 'UTR1234567890');
    // Evidence is required here: still disabled without a file.
    expect(submit).toBeDisabled();
  });

  it('is honest about withdrawn details, pending verification and blocked applications', () => {
    const view = render(
      <StudentReExamPaymentPage
        view={baseView({
          current: payment({ destination: { ...payment().destination, available: false } }),
        })}
      />,
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/no longer offered/);

    view.rerender(
      <StudentReExamPaymentPage
        view={baseView({
          current: payment({
            status: 'SUBMITTED',
            transactionReference: 'UTR1234567890',
            submittedAt: '2026-10-10T11:00:00.000Z',
          }),
        })}
      />,
    );
    expect(screen.getByText(/It is not verified yet/)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();

    view.rerender(
      <StudentReExamPaymentPage
        view={baseView({
          unavailableReason:
            'No fee has been approved for this attempt number. Payment cannot start.',
          regions: [],
        })}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/No fee has been approved/);
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();

    view.rerender(<StudentReExamPaymentPage view={null} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/could not be loaded/);
  });
});

const REVIEWER: AuthUser = {
  ...VIEWER,
  permissions: [...VIEWER.permissions, 'reExamPayments.read'],
};
const VERIFIER: AuthUser = {
  ...REVIEWER,
  permissions: [...REVIEWER.permissions, 'reExamPayments.verify'],
};
const CONFIGURER: AuthUser = {
  ...VIEWER,
  permissions: [...VIEWER.permissions, 'reExamPayments.configure'],
};

const detail: ReExamPaymentDetail = {
  id: PAYMENT_ID,
  status: 'SUBMITTED',
  region: 'INDIA',
  amountMinor: 100_000,
  currency: 'INR',
  createdAt: '2026-10-10T10:00:00.000Z',
  submittedAt: '2026-10-10T11:00:00.000Z',
  reviewedAt: null,
  application: { id: APP_ID, reference: 'RX-0000-00A1', status: 'SUBMITTED', attemptNumber: 1 },
  student: { id: '01900000-0000-7000-8000-0000000000d1', name: 'Test Student One' },
  registrationNumber: 'TEST-REG-1',
  subject: { code: 'SUB-1', name: 'Synthetic Anatomy' },
  transactionReference: 'UTR1234567890',
  hasEvidence: true,
  amountSource: 'FEE_RULE',
  feeRuleVersion: 1,
  destination: {
    id: '01900000-0000-7000-8000-0000000000e9',
    version: 1,
    countryName: null,
    beneficiaryName: 'Synthetic University Fees Account',
    method: 'UPI',
    currency: 'INR',
  },
  programName: 'Test Program',
  academicSessionName: 'Session 2026',
  examinationName: 'Semester 2 Re-examination',
  periodLabel: 'Semester 2',
  evidence: { contentType: 'image/png', sizeBytes: 2048, sha256: 'a'.repeat(64) },
  reviewedBy: null,
  verifiedAmountMinor: null,
  verifiedCurrency: null,
  reviewNote: null,
  rejectionReason: null,
  voidedAt: null,
  voidReason: null,
  otherPayments: [],
  sameReference: [
    {
      id: PAYMENT_ID.replace('c1', 'c2'),
      status: 'REJECTED',
      applicationReference: 'RX-0000-00B2',
    },
  ],
  history: [],
};

describe('staff payment review', () => {
  it('warns that a reference is not proof and offers verification only with the permission', async () => {
    mockFetch(() => ({ body: detail }));
    const view = renderWithProviders(<ReExamPaymentDetailView paymentId={PAYMENT_ID} />, REVIEWER);
    expect(await screen.findByText('Test Student One')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/does not prove the university/);
    expect(screen.getByRole('alert')).toHaveTextContent(/RX-0000-00B2/);
    expect(screen.queryByRole('button', { name: 'Verify payment' })).not.toBeInTheDocument();
    view.unmount();

    renderWithProviders(<ReExamPaymentDetailView paymentId={PAYMENT_ID} />, VERIFIER);
    await userEvent.click(await screen.findByRole('button', { name: 'Verify payment' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = screen.getAllByRole('button', { name: 'Verify payment' }).at(-1);
    expect(dialog).toHaveTextContent(/according to its own account/);
    await userEvent.type(screen.getByLabelText('Amount received'), '1000.00');
    // The account-check confirmation is mandatory.
    expect(confirm).toBeDisabled();
    await userEvent.click(screen.getByLabelText(/I checked the university’s payment account/));
    expect(confirm).toBeEnabled();
  });
});

const destination: PaymentDestinationDetail = {
  id: '01900000-0000-7000-8000-0000000000e9',
  region: 'INDIA',
  version: 1,
  status: 'DRAFT',
  state: 'DRAFT',
  isActive: false,
  countryName: null,
  beneficiaryName: 'Synthetic University Fees Account',
  method: 'UPI',
  currency: 'INR',
  instructions: 'TEST ONLY: scan the synthetic QR.',
  evidenceRequirement: 'OPTIONAL',
  effectiveFrom: '2026-10-01T00:00:00.000Z',
  effectiveUntil: null,
  qr: { contentType: 'image/png', sizeBytes: 4096, sha256: 'b'.repeat(64) },
  rates: [],
  replacesDestinationId: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  createdBy: { id: VIEWER.id, displayName: 'Viewer' },
  updatedAt: '2026-10-01T00:00:00.000Z',
  updatedBy: { id: VIEWER.id, displayName: 'Viewer' },
  approvedAt: null,
  approvedBy: null,
  retiredAt: null,
  retiredBy: null,
  paymentCount: 0,
  history: [],
};

describe('payment settings', () => {
  it('lists the eight choices honestly when nothing is configured', async () => {
    const list: PaymentDestinationList = {
      regions: PAYMENT_REGIONS.map((region) => ({
        region,
        label: PAYMENT_REGION_LABELS[region],
        isGroup: ['EUROPE', 'CENTRAL_ASIA', 'OTHERS'].includes(region),
        approved: null,
        draftCount: 0,
      })),
      data: [],
      feeCurrency: null,
    };
    mockFetch(() => ({ body: list }));
    renderWithProviders(<PaymentDestinationsView />, CONFIGURER);
    expect(await screen.findAllByText(/^Not configured/)).toHaveLength(8);
    expect(screen.getByText(/No re-exam fee rule is active/)).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/never test or invented details/);
  });

  it('does not let the preparer approve their own draft', async () => {
    mockFetch((_method, path) =>
      path === 're-exam-payment-destinations'
        ? { body: { regions: [], data: [], feeCurrency: 'INR' } }
        : { body: destination },
    );
    renderWithProviders(
      <PaymentDestinationDetailView destinationId={destination.id} />,
      CONFIGURER,
    );
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByText(/another authorised staff member must approve it/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Payment QR for India/ })).toBeInTheDocument();
  });
});
