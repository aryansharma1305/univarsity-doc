import { expect, test } from '@playwright/test';

test('the frontend loads and shows live status from the full stack', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);

  await expect(page).toHaveTitle('DOCVERSITY');
  await expect(page.getByRole('heading', { level: 1, name: 'DOCVERSITY' })).toBeVisible();
  await expect(page.getByText('Development Environment')).toBeVisible();

  await expect(page.getByTestId('status-frontend')).toHaveAttribute('data-status', 'ok');
  // These come from a real request chain: browser → Next.js server → API → PostgreSQL/Redis/MinIO.
  await expect(page.getByTestId('status-api')).toHaveAttribute('data-status', 'ok');
  for (const service of ['database', 'redis', 'storage']) {
    await expect(page.getByTestId(`status-${service}`)).toHaveAttribute('data-status', 'ok');
  }

  // Phase 1 must not present controls that look functional but do nothing.
  await expect(page.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('link')).toHaveCount(0);
});
