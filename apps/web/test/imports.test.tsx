// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser, ImportJob } from '@docversity/validation';
import { checkWorkbookFile, FileDropzone } from '@/features/imports/file-dropzone';
import { ImportDetailView } from '@/features/imports/import-detail-view';
import { ImportStepper, stepForStatus } from '@/features/imports/import-stepper';
import { ImportsView } from '@/features/imports/imports-view';
import { EMPTY_PAGE, REGISTRAR, VIEWER, mockFetch, renderWithProviders } from './render';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/imports',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

const IMPORTER: AuthUser = {
  ...REGISTRAR,
  permissions: [...REGISTRAR.permissions, 'imports.read', 'imports.students.run'],
};

const ID = '01900000-0000-7000-8000-0000000000ff';
const COUNTS = {
  total: 0,
  valid: 0,
  warnings: 0,
  errors: 0,
  create: 0,
  update: 0,
  unchanged: 0,
  imported: 0,
  skipped: 0,
  created: 0,
  updated: 0,
};

function job(overrides: Partial<ImportJob> = {}): ImportJob {
  return {
    id: ID,
    type: 'STUDENTS',
    status: 'VALIDATED',
    originalFilename: 'students.xlsx',
    fileSizeBytes: 2048,
    progress: 100,
    sheets: [],
    mapping: null,
    counts: {
      ...COUNTS,
      total: 4,
      valid: 2,
      warnings: 1,
      errors: 1,
      create: 2,
      update: 1,
      unchanged: 0,
    },
    applyUpdates: false,
    failure: null,
    hasErrorReport: true,
    actions: { map: true, validate: true, commit: true, cancel: true, retry: false },
    createdBy: { id: IMPORTER.id, displayName: 'Registrar' },
    committedBy: null,
    createdAt: '2026-10-08T10:00:00.000Z',
    validatedAt: '2026-10-08T10:01:00.000Z',
    completedAt: null,
    cancelledAt: null,
    updatedAt: '2026-10-08T10:01:00.000Z',
    ...overrides,
  };
}

describe('import wizard helpers', () => {
  it('maps persisted statuses to wizard steps', () => {
    expect(stepForStatus('UPLOADED')).toBe(1);
    expect(stepForStatus('MAPPING')).toBe(2);
    expect(stepForStatus('VALIDATING')).toBe(3);
    expect(stepForStatus('VALIDATED')).toBe(4);
    expect(stepForStatus('PROCESSING')).toBe(5);
    expect(stepForStatus('FAILED')).toBe(-1);
  });

  it('announces the current step to assistive technology', () => {
    renderWithProviders(<ImportStepper current={2} />);
    const current = screen.getByRole('listitem', { current: 'step' });
    expect(current).toHaveTextContent('Map columns');
    expect(current).toHaveTextContent('step 3 of 6, Map columns, current step');
  });

  it('pre-checks the chosen file (type, emptiness, size)', () => {
    expect(checkWorkbookFile(new File(['x'], 'a.csv'))).toMatch(/\.xlsx/);
    expect(checkWorkbookFile(new File([], 'a.xlsx'))).toMatch(/empty/);
    expect(checkWorkbookFile(new File(['x'], 'A.XLSX'))).toBeNull();
  });

  it('shows the chosen file name, size and type before upload (keyboard file picker)', async () => {
    const onFile = vi.fn();
    const { rerender } = renderWithProviders(<FileDropzone file={null} onFile={onFile} />);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('no input');
    const file = new File(['x'.repeat(2048)], 'students.xlsx');
    await userEvent.upload(input, file);
    expect(onFile).toHaveBeenCalledWith(file);
    rerender(<FileDropzone file={file} onFile={onFile} />);
    expect(screen.getByText('students.xlsx')).toBeInTheDocument();
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
    expect(screen.getByText('Excel workbook (.xlsx)')).toBeInTheDocument();
  });
});

describe('ImportsView', () => {
  it('shows the empty state with an "Import students" call to action', async () => {
    mockFetch((_method, path) => ({
      body: path === 'imports/creators' ? { data: [] } : EMPTY_PAGE,
    }));
    renderWithProviders(<ImportsView />, IMPORTER);
    expect(await screen.findByText('No student imports yet')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Import students' }).length).toBeGreaterThan(0);
  });

  it('hides the import action from users who may only read', async () => {
    mockFetch((_method, path) => ({
      body: path === 'imports/creators' ? { data: [] } : EMPTY_PAGE,
    }));
    renderWithProviders(<ImportsView />, {
      ...VIEWER,
      permissions: [...VIEWER.permissions, 'imports.read'],
    });
    expect(await screen.findByText('No student imports yet')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Import students' })).not.toBeInTheDocument();
  });
});

describe('ImportDetailView', () => {
  it('shows the validation summary and requires explicit approval for updates', async () => {
    const commits: unknown[] = [];
    mockFetch((method, path, body) => {
      if (path === `imports/${ID}/commit`) {
        commits.push(body);
        return { body: job({ status: 'PROCESSING', progress: 0 }) };
      }
      if (path.startsWith(`imports/${ID}/rows`)) return { body: EMPTY_PAGE };
      return { body: job() };
    });
    renderWithProviders(<ImportDetailView importId={ID} />, IMPORTER);
    expect(await screen.findByText('Validation summary')).toBeInTheDocument();
    const summary = screen.getByText('Total rows').closest('dl');
    expect(summary).toHaveTextContent('Total rows4');
    expect(summary).toHaveTextContent('Errors1');

    // Without approval only the 2 CREATE rows are imported.
    expect(screen.getByRole('button', { name: 'Import 2 rows' })).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/Also apply the 1 proposed updates/));
    await userEvent.click(screen.getByRole('button', { name: 'Import 3 rows' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Import now' }));
    await waitFor(() => {
      expect(commits).toEqual([{ applyUpdates: true }]);
    });
    expect(await screen.findByRole('progressbar', { name: 'Importing' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
  });

  it('explains a failure without technical details and offers retry only when safe', async () => {
    mockFetch(() => ({
      body: job({
        status: 'FAILED',
        counts: COUNTS,
        failure: {
          stage: 'PARSE',
          code: 'NOT_XLSX',
          message: 'This file is not a valid .xlsx workbook.',
          retryable: false,
        },
        actions: { map: false, validate: false, commit: false, cancel: false, retry: false },
      }),
    }));
    renderWithProviders(<ImportDetailView importId={ID} />, IMPORTER);
    expect(await screen.findByText('Import failed')).toBeInTheDocument();
    expect(screen.getByText('This file is not a valid .xlsx workbook.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start a new import' })).toBeInTheDocument();
  });
});
