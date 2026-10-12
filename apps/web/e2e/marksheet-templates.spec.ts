import { test, expect } from '@playwright/test';
import {
  fixtures,
  signIn,
  capture,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
} from './support';
test('staff synthetic template previews fit every viewport, generate PDFs and support keyboard/reduced motion', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page, fixtures().admin);
  await page.goto('/admin/marksheet-templates');
  await expect(page.getByRole('button', { name: 'Generate sample PDF' })).toBeEnabled();
  for (const [width, height, label] of [
    [1440, 1000, 'desktop'],
    [768, 1024, 'tablet'],
    [390, 844, 'mobile'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page);
    await capture(page, `phase11b-templates-${label}`);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByLabel('Synthetic example').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Generate sample PDF' })).toBeFocused();
  for (const fixture of ['semester', 'year', 'stress']) {
    await page.getByLabel('Synthetic example').selectOption(fixture);
    const response = page.waitForResponse(
      (r) => r.url().includes('/marksheet-templates/preview?') && r.status() === 200,
    );
    await page.getByRole('button', { name: 'Generate sample PDF' }).click();
    const pdf = await response;
    expect(pdf.headers()['content-type']).toContain('application/pdf');
    expect(pdf.headers()['cache-control']).toBe('no-store');
    await expect(page.getByTitle('Synthetic marksheet PDF preview')).toBeVisible();
    const downloading = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download sample' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe(`sample-marksheet-${fixture}-v1.pdf`);
    await download.saveAs(`test-results/screenshots/phase11b-${fixture}.pdf`);
    await expectNoHorizontalOverflow(page);
  }
});
test('viewer cannot preview or navigate to templates; rendering errors have working recovery', async ({
  page,
}) => {
  await signIn(page, fixtures().viewer);
  await page.goto('/admin/marksheet-templates');
  await expect(page.getByRole('heading', { name: 'You don’t have access to this' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate sample PDF' })).toHaveCount(0);
  await expect(
    page
      .getByRole('navigation', { name: 'Sections' })
      .getByRole('link', { name: 'Marksheet Templates', exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoSeriousA11yViolations(page);
  await capture(page, 'phase11b-templates-forbidden');
  await page.context().clearCookies();
  await signIn(page, fixtures().admin);
  await page.goto('/admin/marksheet-templates');
  const previewRoute = /\/api\/v1\/+marksheet-templates\/preview\?/;
  await page.route(previewRoute, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Preview temporarily unavailable.',
          requestId: 'synthetic-preview-error',
        },
      }),
    }),
  );
  await page.getByRole('button', { name: 'Generate sample PDF' }).click();
  await expect(
    page.getByRole('region', { name: 'Document preview' }).getByRole('alert'),
  ).toHaveText('Preview temporarily unavailable.');
  await page.unroute(previewRoute);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('link', { name: 'Download sample' })).toBeVisible();
});
