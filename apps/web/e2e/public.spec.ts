import { expect, test } from '@playwright/test';
import { capture, expectNoHorizontalOverflow } from './support';

const SERVICES = [
  { card: 'Check Results', url: /\/results$/, heading: 'Check Results' },
  {
    card: 'Registration Verification',
    url: /\/verify\/registration$/,
    heading: 'Registration Verification',
  },
  {
    card: 'Certificate Verification',
    url: /\/verify\/certificate$/,
    heading: 'Certificate Verification',
  },
  { card: 'Scan QR', url: /\/verify\/qr$/, heading: 'Scan QR' },
] as const;

test('homepage renders the portal and its services (desktop)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Academic Verification & Records Portal' }),
  ).toBeVisible();
  const main = page.getByRole('main');
  for (const service of SERVICES)
    await expect(main.getByRole('link', { name: new RegExp(service.card) })).toBeVisible();
  await expect(page.getByText(/ISO 27001|blockchain|FERPA|GDPR/i)).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await capture(page, 'public-home-desktop');
});

test('service cards lead to honest placeholders with no working forms', async ({ page }) => {
  for (const service of SERVICES) {
    await page.goto('/');
    await page
      .getByRole('main')
      .getByRole('link', { name: new RegExp(service.card) })
      .click();
    await expect(page).toHaveURL(service.url);
    await expect(page.getByRole('heading', { level: 1, name: service.heading })).toBeVisible();
    await expect(page.getByTestId('not-available')).toHaveText(/Not available yet/);
    await expect(page.locator('main input, main form, main textarea')).toHaveCount(0);
  }
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('homepage and menu work at 390px', async ({ page }) => {
    await page.goto('/');
    await expectNoHorizontalOverflow(page);
    await capture(page, 'public-home-mobile');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('dialog').getByRole('link', { name: 'Certificate Verification' }).click();
    await expect(page).toHaveURL(/\/verify\/certificate$/);
  });
});
