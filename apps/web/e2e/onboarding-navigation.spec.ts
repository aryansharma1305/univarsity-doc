import { expect, test } from '@playwright/test';
import { fixtures, signIn } from './support';

test('pending student search does not cancel navigation to Imports', async ({ page }) => {
  // Keep the outgoing list mounted past its search debounce, as on a slow connection.
  await page.route(
    (url) => url.pathname === '/admin/imports',
    async (route) => {
      if (route.request().headers()['next-router-prefetch']) {
        await route.abort();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.continue();
    },
  );
  await signIn(page, fixtures().registrar);
  await page.goto('/admin/students');
  await expect(page.getByRole('heading', { name: 'Students', level: 1 })).toBeVisible();
  await page.getByLabel('Search students').fill('SYNTHETIC-PENDING-SEARCH');
  await page
    .getByRole('complementary', { name: 'Admin navigation' })
    .getByRole('link', { name: 'Imports', exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/imports$/);
  await expect(page.getByRole('heading', { name: 'Imports', level: 1 })).toBeVisible();
});
