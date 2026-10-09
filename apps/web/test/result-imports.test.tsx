// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewResultPreviewView } from '@/features/result-imports/new-preview-view';
import { ResultPreviewView } from '@/features/result-imports/preview-view';
import { REGISTRAR, VIEWER, mockFetch, renderWithProviders } from './render';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/admin/results/import',
}));
afterEach(() => vi.unstubAllGlobals());
const importer = {
  ...REGISTRAR,
  permissions: [...REGISTRAR.permissions, 'imports.results.run' as const],
};
describe('results preview access and recovery', () => {
  it('denies read-only staff before making requests', () => {
    const fetch = mockFetch(() => ({ body: {} }));
    renderWithProviders(<NewResultPreviewView />, VIEWER);
    expect(screen.getByText('You don’t have access to this')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('requires an existing examination context and always identifies preview-only operation', async () => {
    mockFetch(() => ({ body: { programs: [] } }));
    renderWithProviders(<NewResultPreviewView />, importer);
    expect(await screen.findByText('No examination context available')).toBeInTheDocument();
    expect(
      screen.getByText('Preview only — no marks have been saved to official records.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Upload and map/ })).not.toBeInTheDocument();
  });
  it('recovers safely from expired or inaccessible previews without revealing ownership', async () => {
    mockFetch(() => ({
      status: 404,
      body: { error: { code: 'NOT_FOUND', message: 'Preview unavailable' } },
    }));
    renderWithProviders(<ResultPreviewView id="01900000-0000-7000-8000-0000000000ff" />, importer);
    expect(await screen.findByRole('heading', { name: 'Preview unavailable' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upload again' })).toHaveAttribute(
      'href',
      '/admin/results/import',
    );
    expect(screen.queryByRole('button', { name: /Validate/ })).not.toBeInTheDocument();
  });
});
