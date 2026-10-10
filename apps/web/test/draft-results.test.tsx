// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DraftEditorView } from '@/features/draft-results/editor-view';
import { DraftResultsListView } from '@/features/draft-results/list-view';
import { DraftImportAction } from '@/features/draft-results/import-action';
import { VIEWER, mockFetch, renderWithProviders } from './render';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/admin/results',
}));
afterEach(() => vi.unstubAllGlobals());
it('denies write-only entry for a viewer without fetching context', () => {
  const fetch = mockFetch(() => ({ body: {} }));
  renderWithProviders(<DraftEditorView />, VIEWER);
  expect(screen.getByText('You don’t have access to this')).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
it('shows the internal-only empty draft list without a create action for a viewer', async () => {
  mockFetch(() => ({ body: { items: [] } }));
  renderWithProviders(<DraftResultsListView />, {
    ...VIEWER,
    permissions: [...VIEWER.permissions, 'results.read' as const],
  });
  expect(await screen.findByText('No saved drafts')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Enter marks' })).not.toBeInTheDocument();
});
it('hides Excel persistence for staff without results.write', () => {
  const fetch = mockFetch(() => ({ body: {} }));
  renderWithProviders(
    <DraftImportAction previewId="01900000-0000-7000-8000-000000000001" onSaved={vi.fn()} />,
    VIEWER,
  );
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
