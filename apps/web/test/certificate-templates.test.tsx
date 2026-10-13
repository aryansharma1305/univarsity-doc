// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  can: vi.fn(),
  list: vi.fn(),
  preview: vi.fn(),
  create: vi.fn(),
  revoke: vi.fn(),
}));
vi.mock('@/components/providers/session-context', () => ({ useCan: mocks.can }));
vi.mock('@/features/certificate-templates/api', () => ({
  certificateTemplatesApi: { list: mocks.list, preview: mocks.preview },
}));
import { CertificateTemplatesView } from '@/features/certificate-templates/preview-view';
afterEach(() => vi.unstubAllGlobals());
function mount() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <CertificateTemplatesView />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.can.mockReturnValue(true);
  mocks.create.mockReturnValue('blob:synthetic');
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = mocks.create;
      static override revokeObjectURL = mocks.revoke;
    },
  );
  mocks.list.mockResolvedValue({
    templates: [{ id: 'sample-training', version: 1 }],
    fixtures: [
      { id: 'standard', label: 'Standard training sample' },
      { id: 'long-text', label: 'Long name and course sample' },
    ],
  });
  mocks.preview.mockResolvedValue({ blob: new Blob(['%PDF-']), filename: 'sample.pdf' });
});
it('denies unprivileged staff without fetching or exposing preview controls', () => {
  mocks.can.mockReturnValue(false);
  mount();
  expect(
    screen.getByRole('heading', { name: 'You don’t have access to this' }),
  ).toBeInTheDocument();
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.preview).not.toHaveBeenCalled();
});
it('generates only selected fixed samples, downloads identical bytes and revokes previews', async () => {
  const view = mount();
  await screen.findByRole('button', { name: 'Generate sample PDF' });
  fireEvent.change(screen.getByLabelText('Synthetic example'), { target: { value: 'long-text' } });
  fireEvent.click(screen.getByRole('button', { name: 'Generate sample PDF' }));
  const download = await screen.findByRole('link', { name: 'Download sample' });
  expect(download).toHaveAttribute('href', 'blob:synthetic');
  expect(mocks.preview).toHaveBeenCalledWith({
    templateId: 'sample-training',
    version: 1,
    fixture: 'long-text',
    disposition: 'inline',
  });
  expect(screen.getByTitle('Synthetic training certificate PDF preview')).toHaveAttribute(
    'src',
    'blob:synthetic',
  );
  view.unmount();
  expect(mocks.revoke).toHaveBeenCalledWith('blob:synthetic');
});
it('shows a rendering failure and retries successfully without claiming issuance', async () => {
  mocks.preview.mockRejectedValueOnce(new Error('Synthetic renderer unavailable'));
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Generate sample PDF' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('link', { name: 'Download sample' });
  expect(screen.getByText('SAMPLE · NOT OFFICIAL')).toBeInTheDocument();
  expect(mocks.preview).toHaveBeenCalledTimes(2);
});
it('allows recovery after a failed template-list request', async () => {
  mocks.list.mockRejectedValueOnce(new Error('Unavailable'));
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.getByLabelText('Synthetic example')).toBeInTheDocument());
});
