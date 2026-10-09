// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser, HistoricalDocumentDetail, StudentDocument } from '@docversity/validation';
import { DocumentDetailView } from '@/features/historical-documents/document-detail-view';
import { HistoricalDocumentsView } from '@/features/historical-documents/documents-view';
import { UploadDocumentView } from '@/features/historical-documents/upload-view';
import { StudentDocuments } from '@/features/student-portal/student-documents';
import { EMPTY_PAGE, REGISTRAR, mockFetch, renderWithProviders } from './render';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/historical-documents',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

const ALL: AuthUser = {
  ...REGISTRAR,
  id: '01900000-0000-7000-8000-0000000000f1',
  permissions: [
    ...REGISTRAR.permissions,
    'historicalDocuments.read',
    'historicalDocuments.upload',
    'historicalDocuments.publish',
    'historicalDocuments.verify',
  ],
};
const PREPARER: AuthUser = {
  ...REGISTRAR,
  permissions: [...REGISTRAR.permissions, 'historicalDocuments.read', 'historicalDocuments.upload'],
};
const READER: AuthUser = { ...REGISTRAR, permissions: ['historicalDocuments.read'] };

function detail(overrides: Partial<HistoricalDocumentDetail> = {}): HistoricalDocumentDetail {
  return {
    id: '01900000-0000-7000-8000-0000000000d1',
    reference: 'HD-0000-00D1',
    isReplacement: false,
    revision: 1,
    documentType: 'DEGREE_CERTIFICATE',
    title: 'Synthetic degree certificate',
    certificateNumber: 'LEG/2019/00042',
    certificateNumberNormalized: 'LEG201900042',
    issuedOn: '2019-07-15',
    status: 'DRAFT',
    authenticity: 'UNVERIFIED',
    student: { id: '01900000-0000-7000-8000-0000000000a1', fullName: 'Test Student One' },
    registration: {
      id: '01900000-0000-7000-8000-0000000000b1',
      registrationNumber: 'TEST-REG-1',
      program: { id: '01900000-0000-7000-8000-0000000000c1', code: 'TP', name: 'Test Program' },
    },
    file: {
      contentType: 'application/pdf',
      sizeBytes: 2048,
      sha256: 'a'.repeat(64),
      originalFilename: 'scan.pdf',
    },
    uploadedBy: { id: '01900000-0000-7000-8000-0000000000e9', displayName: 'Other Staff' },
    createdAt: '2026-10-09T10:00:00.000Z',
    publishedAt: null,
    provenance: 'LEGACY_WORDPRESS',
    provenanceNote: null,
    legacySourceSystem: 'WORDPRESS',
    legacyRecordId: 'wp-post-12345',
    legacyVerificationUrl: 'https://verify.example.test/certificate?id=ABC123',
    publishedBy: null,
    withdrawnAt: null,
    withdrawnBy: null,
    withdrawalReason: null,
    supersededAt: null,
    authenticityNote: null,
    authenticityReviewedAt: null,
    authenticityReviewedBy: null,
    studentCopy: { status: 'NOT_REQUIRED', sizeBytes: null, sha256: null, createdAt: null },
    embeddedMetadata: { inspected: false, categories: [] },
    replaces: null,
    replacedBy: null,
    versions: [],
    sameNumberElsewhere: [],
    history: [],
    ...overrides,
  };
}

function serve(doc: HistoricalDocumentDetail) {
  return mockFetch((_method, path) =>
    path.startsWith('historical-documents/') ? { body: doc } : { body: EMPTY_PAGE },
  );
}

describe('admin document detail', () => {
  it('offers edit and publish on a draft, keeps legacy identifiers as plain text', async () => {
    serve(detail());
    renderWithProviders(<DocumentDetailView documentId={detail().id} />, ALL);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Synthetic degree certificate' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit draft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish to student' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replace' })).not.toBeInTheDocument();
    expect(
      screen.getByText('https://verify.example.test/certificate?id=ABC123'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /verify\.example\.test/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Download original/ })).toHaveAttribute(
      'href',
      `/api/v1/historical-documents/${detail().id}/file?disposition=attachment&variant=original`,
    );
    expect(screen.getAllByText(/never a cryptographic/).length).toBeGreaterThan(0);
  });

  it('replaces (not edits) a published document and blocks the uploader from reviewing it', async () => {
    serve(
      detail({
        status: 'PUBLISHED',
        publishedAt: '2026-10-09T11:00:00.000Z',
        uploadedBy: { id: ALL.id, displayName: 'Me' },
      }),
    );
    renderWithProviders(<DocumentDetailView documentId={detail().id} />, ALL);
    expect(await screen.findByRole('button', { name: 'Replace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit draft' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review authenticity' })).toBeDisabled();
    expect(screen.getByText(/another authorised reviewer must record/)).toBeInTheDocument();
  });

  it('shows no lifecycle actions on a superseded document, and none for read-only staff', async () => {
    serve(
      detail({
        status: 'SUPERSEDED',
        publishedAt: '2026-10-09T11:00:00.000Z',
        supersededAt: '2026-10-10T11:00:00.000Z',
      }),
    );
    const view = renderWithProviders(<DocumentDetailView documentId={detail().id} />, ALL);
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getAllByText('Superseded').length).toBeGreaterThan(0);
    for (const name of [
      'Edit draft',
      'Replace',
      'Withdraw',
      'Publish to student',
      'Review authenticity',
    ]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    view.unmount();
    serve(detail());
    renderWithProviders(<DocumentDetailView documentId={detail().id} />, READER);
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Edit|Publish|Withdraw|Replace|Review/ }),
    ).not.toBeInTheDocument();
  });

  it('requires a reason to withdraw', async () => {
    serve(detail({ status: 'PUBLISHED', publishedAt: '2026-10-09T11:00:00.000Z' }));
    renderWithProviders(<DocumentDetailView documentId={detail().id} />, ALL);
    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Withdraw document' });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Reason/), 'Wrong registration.');
    expect(confirm).toBeEnabled();
  });
});

describe('admin list and upload', () => {
  it('hides the upload action without the upload permission', async () => {
    mockFetch(() => ({ body: EMPTY_PAGE }));
    renderWithProviders(<HistoricalDocumentsView />, READER);
    expect(await screen.findByText('No historical documents yet')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Upload document/ })).not.toBeInTheDocument();
  });

  it('checks the file type before uploading and requires a registration', async () => {
    const fetchMock = mockFetch(() => ({ body: EMPTY_PAGE }));
    renderWithProviders(<UploadDocumentView />, PREPARER);
    await userEvent.upload(
      screen.getByLabelText(/^File/),
      new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }),
      { applyAccept: false },
    );
    expect(screen.getByText('Choose a PDF, JPEG or PNG file.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Title/), 'Synthetic certificate');
    await userEvent.click(screen.getByRole('button', { name: 'Upload as draft' }));
    expect(await screen.findByText(/Choose the registration/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });
});

describe('student document library', () => {
  const doc: StudentDocument = {
    id: '01900000-0000-7000-8000-0000000000d2',
    reference: 'HD-0000-00D2',
    available: true,
    documentType: 'MARKSHEET',
    title: 'Semester 1 marksheet',
    certificateNumber: null,
    issuedOn: '2018-12-01',
    registrationNumber: 'TEST-REG-1',
    program: { id: '01900000-0000-7000-8000-0000000000c1', code: 'TP', name: 'Test Program' },
    contentType: 'application/pdf',
    sizeBytes: 300_000,
    publishedAt: '2026-10-09T11:00:00.000Z',
    authenticity: 'UNVERIFIED',
    authenticityReviewedAt: null,
  };

  it('lists own documents read-only, with authenticity stated separately and honestly', () => {
    render(
      <StudentDocuments
        documents={[
          doc,
          {
            ...doc,
            id: '01900000-0000-7000-8000-0000000000d3',
            title: 'Degree certificate',
            authenticity: 'CONFIRMED_AGAINST_RECORDS',
            authenticityReviewedAt: '2026-10-09T12:00:00.000Z',
          },
        ]}
      />,
    );
    const first = screen.getByRole('article', { name: 'Semester 1 marksheet' });
    expect(within(first).getByText(/Not independently verified/)).toBeInTheDocument();
    expect(within(first).getByText('Not recorded')).toBeInTheDocument();
    expect(
      within(first).getByRole('link', { name: 'Download Semester 1 marksheet' }),
    ).toHaveAttribute('href', `/api/v1/student/documents/${doc.id}/file?disposition=attachment`);
    const second = screen.getByRole('article', { name: 'Degree certificate' });
    expect(within(second).getByText(/Confirmed against university records/)).toBeInTheDocument();
    expect(screen.queryByText(/cryptograph|digitally verified/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/upload|delete|replace/i)).not.toBeInTheDocument();
  });

  it('shows honest empty and error states', () => {
    const view = render(<StudentDocuments documents={[]} />);
    expect(screen.getByText('No documents published yet')).toBeInTheDocument();
    view.rerender(<StudentDocuments documents={null} />);
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
  });
});

describe('Phase 8 hardening: metadata, exact numbers and versions', () => {
  const image = (overrides: Partial<HistoricalDocumentDetail> = {}) =>
    detail({
      file: {
        contentType: 'image/jpeg',
        sizeBytes: 480_000,
        sha256: 'b'.repeat(64),
        originalFilename: 'scan.jpg',
      },
      studentCopy: {
        status: 'READY',
        sizeBytes: 450_000,
        sha256: 'c'.repeat(64),
        createdAt: '2026-10-09T10:00:00.000Z',
      },
      embeddedMetadata: { inspected: true, categories: ['LOCATION', 'DEVICE', 'PERSON'] },
      ...overrides,
    });

  it('warns staff about location metadata (kinds only) and offers the student copy separately', async () => {
    serve(image());
    renderWithProviders(<DocumentDetailView documentId={detail().id} />, ALL);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This scan contains location (GPS) metadata');
    expect(alert).toHaveTextContent('Camera or scanner details');
    expect(alert).toHaveTextContent(
      'Students receive a separate copy with all embedded metadata removed',
    );
    expect(screen.getByRole('link', { name: /Open student copy/ })).toHaveAttribute(
      'href',
      `/api/v1/historical-documents/${detail().id}/file?disposition=inline&variant=student`,
    );
    expect(screen.getByRole('link', { name: /Open original/ })).toHaveAttribute(
      'href',
      `/api/v1/historical-documents/${detail().id}/file?disposition=inline&variant=original`,
    );
    expect(screen.getByText(/A copy without embedded metadata/)).toBeInTheDocument();
    expect(screen.getByText('c'.repeat(64))).toBeInTheDocument();
  });

  it('blocks publishing an older image until its student copy exists', async () => {
    serve(
      image({
        studentCopy: { status: 'PENDING', sizeBytes: null, sha256: null, createdAt: null },
        embeddedMetadata: { inspected: false, categories: [] },
      }),
    );
    renderWithProviders(<DocumentDetailView documentId={detail().id} />, ALL);
    expect(await screen.findByText('Student copy not created yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish to student' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: /Open student copy/ })).not.toBeInTheDocument();
  });

  it('shows the certificate number exactly as recorded, with surrounding spaces stated', async () => {
    serve(
      detail({ certificateNumber: '  ACC/Cert/1001 ', certificateNumberNormalized: 'ACCCERT1001' }),
    );
    renderWithProviders(<DocumentDetailView documentId={detail().id} />, ALL);
    expect(
      await screen.findByText((_text, element) => element?.textContent === '  ACC/Cert/1001 '),
    ).toBeInTheDocument();
    expect(screen.getByText(/including 2 leading and 1 trailing spaces/)).toBeInTheDocument();
    expect(screen.getByText('ACCCERT1001')).toBeInTheDocument();
  });

  it('identifies previous and current versions by revision and reference, not by title', async () => {
    const v1 = {
      id: detail().id,
      reference: 'HD-0000-00D1',
      revision: 1,
      title: 'Synthetic degree certificate',
      certificateNumber: 'LEG/2019/00042',
      status: 'SUPERSEDED' as const,
      createdAt: '2026-10-09T10:00:00.000Z',
      publishedAt: '2026-10-09T11:00:00.000Z',
    };
    const v2 = {
      ...v1,
      id: '01900000-0000-7000-8000-0000000000d9',
      reference: 'HD-0000-00D9',
      revision: 2,
      status: 'PUBLISHED' as const,
      createdAt: '2026-10-10T10:00:00.000Z',
      publishedAt: '2026-10-10T11:00:00.000Z',
    };
    serve(
      detail({
        status: 'SUPERSEDED',
        publishedAt: v1.publishedAt,
        supersededAt: v2.publishedAt,
        replacedBy: v2,
        versions: [v1, v2],
      }),
    );
    renderWithProviders(<DocumentDetailView documentId={detail().id} />, ALL);
    expect(await screen.findByText('This is an earlier version.')).toBeInTheDocument();
    expect(
      screen.getByText(
        (_text, element) =>
          element?.tagName === 'P' &&
          element.textContent === 'Degree certificate · HD-0000-00D1 · Revision 1',
      ),
    ).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'Revision 2 · HD-0000-00D9' });
    expect(links.length).toBe(2); // banner + version list
    for (const link of links) {
      expect(link).toHaveAttribute('href', `/admin/historical-documents/${v2.id}`);
    }
    expect(screen.getByText('Revision 1 · HD-0000-00D1 (this document)')).toBeInTheDocument();
    // No link is labelled only with the (identical) title.
    expect(
      screen.queryByRole('link', { name: 'Synthetic degree certificate' }),
    ).not.toBeInTheDocument();
  });

  it('shows references and replacement markers in the staff list', async () => {
    const row = {
      ...detail(),
      reference: 'HD-0000-00D9',
      isReplacement: true,
    };
    mockFetch(() => ({
      body: { data: [row], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 } },
    }));
    renderWithProviders(<HistoricalDocumentsView />, READER);
    expect((await screen.findAllByText('HD-0000-00D9')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Replacement/).length).toBeGreaterThan(0);
  });

  it('tells a student an image is being prepared and offers no file meanwhile', () => {
    render(
      <StudentDocuments
        documents={[
          {
            id: '01900000-0000-7000-8000-0000000000d4',
            reference: 'HD-0000-00D4',
            documentType: 'PROVISIONAL_CERTIFICATE',
            title: 'Provisional certificate',
            certificateNumber: 'P-1',
            issuedOn: null,
            registrationNumber: 'TEST-REG-1',
            program: {
              id: '01900000-0000-7000-8000-0000000000c1',
              code: 'TP',
              name: 'Test Program',
            },
            contentType: 'application/pdf',
            sizeBytes: 1000,
            publishedAt: '2026-10-09T11:00:00.000Z',
            authenticity: 'UNVERIFIED',
            authenticityReviewedAt: null,
            available: false,
          },
        ]}
      />,
    );
    const card = screen.getByRole('article', { name: 'Provisional certificate' });
    expect(within(card).getByText(/being prepared for viewing/)).toBeInTheDocument();
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();
    expect(within(card).getByText(/Ref HD-0000-00D4/)).toBeInTheDocument();
  });
});
