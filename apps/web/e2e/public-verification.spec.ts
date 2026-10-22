import { unavailableVerificationResponseSchema } from '@docversity/validation';
import { expect, test } from '@playwright/test';
import { capture, expectNoHorizontalOverflow, expectNoSeriousA11yViolations } from './support';
const services = [
  'Result Checking',
  'Registration Verification',
  'Certificate Verification',
  'Admission Letter Verification',
];
for (const width of [1440, 768, 390]) {
  test(`public verification is fail-closed and accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto('/verify');
    await expect(page.getByRole('tab', { name: /Result Checking/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const cards = await page.getByRole('tablist').boundingBox();
    const panel = await page.getByRole('tabpanel').boundingBox();
    expect(cards).not.toBeNull();
    expect(panel).not.toBeNull();
    if (cards && panel) expect(panel.y).toBeGreaterThanOrEqual(cards.y + cards.height);
    for (const service of services) {
      await page.getByRole('tab', { name: new RegExp(service) }).click();
      await expect(page.getByRole('heading', { name: service, exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Check service availability' }).click();
      await expect(page.getByRole('tabpanel').getByRole('alert')).toContainText(
        'Enter a reference',
      );
      await page.getByLabel('Reference', { exact: true }).fill('SYNTHETIC-13A');
      const request = page.waitForResponse(
        (response) =>
          response.url().includes('/api/v1/public/verify/') &&
          response.request().method() === 'POST',
      );
      await page.getByRole('button', { name: 'Check service availability' }).click();
      const response = await request;
      expect(response.status()).toBe(200);
      expect(unavailableVerificationResponseSchema.parse(await response.json()).status).toBe(
        'UNAVAILABLE',
      );
      await expect(page.getByRole('status')).toContainText('No record has been checked');
      await expect(page.getByLabel('Reference', { exact: true })).toHaveValue('');
      await expectNoHorizontalOverflow(page);
      await expectNoSeriousA11yViolations(page);
    }
    await page.getByRole('tab', { name: /Result Checking/ }).click();
    await capture(page, `phase13a-verification-${width}`);
  });
}
test('keyboard tabs, reduced motion, loading, errors and unexpected success stay safe', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/verify');
  expect(
    await page
      .getByRole('region', { name: 'Result Checking', exact: true })
      .evaluate((element) => element.getAnimations().length),
  ).toBe(0);
  const first = page.getByRole('tab', { name: /Result Checking/ });
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /Registration Verification/ })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: /Admission Letter Verification/ })).toBeFocused();
  await page.getByLabel('Reference', { exact: true }).fill('SYNTHETIC-13A');
  let release: () => void = () => {
    throw new Error('Test response gate not initialized');
  };
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/public/verify/**', async (route) => {
    await held;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        contractVersion: 1,
        service: 'admission-letter',
        status: 'VERIFIED',
        message: 'Synthetic automated-test success must never render.',
      }),
    });
  });
  await page.getByRole('button', { name: 'Check service availability' }).click();
  await expect(page.getByRole('button', { name: 'Checking availability…' })).toBeDisabled();
  release();
  await expect(page.getByRole('status')).toContainText('No record has been checked');
  await expect(page.getByText('Synthetic automated-test success must never render.')).toHaveCount(
    0,
  );
  await page.unrouteAll();
  await page.route('**/api/v1/public/verify/**', (route) =>
    route.fulfill({ status: 429, json: { error: { code: 'PUBLIC_VERIFICATION_RATE_LIMITED' } } }),
  );
  await page.getByRole('button', { name: 'Check service availability' }).click();
  await expect(page.getByRole('status')).toContainText('Too many requests');
  await expectNoSeriousA11yViolations(page);
});
