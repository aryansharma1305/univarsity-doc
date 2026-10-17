import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { studentDocumentListSchema } from '@docversity/validation';
import {
  fixtures,
  studentSignIn,
  capture,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
} from './support';
const path = '/api/v1/student/certificate-samples/sample-training-v1/file';
const hash = '42624f64d67bbc6447b839b5b1136cdd450ca4bb5cb6bd6d54394a3daebd5d40';
test('student finds, previews and downloads the fixed sample across all sizes with accessible direct actions', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const student = fixtures().profileStudents[0];
  if (!student) throw new Error('Missing synthetic student');
  await studentSignIn(page, student);
  const initialResponse = await page.request.get('/api/v1/student/documents');
  expect(initialResponse.status()).toBe(200);
  const initialDocuments = studentDocumentListSchema.parse(await initialResponse.json());
  await page.goto('/student/certificate-requests');
  await page.getByRole('link', { name: 'View Sample Certificate', exact: true }).click();
  await expect(page).toHaveURL(/\/student\/documents#certificate-samples$/);
  for (const [width, height, size] of [
    [1440, 1000, 'desktop'],
    [768, 1024, 'tablet'],
    [390, 844, 'mobile'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(page.getByRole('heading', { name: 'View Sample Certificate' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Training Certificate', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Not valid for verification.')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page);
    await capture(page, `ui05-documents-${size}`);
    await page.screenshot({ path: `test-results/screenshots/ui05-documents-${size}-viewport.png` });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const preview = page.getByRole('link', { name: 'Preview Sample (opens in a new tab)' });
  await preview.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Download Sample PDF' })).toBeFocused();
  await capture(page, 'ui05-keyboard-reduced-motion');
  const responsePromise = context.waitForEvent('response', (r) =>
    r.url().includes(`${path}?disposition=inline`),
  );
  const popupPromise = page.waitForEvent('popup');
  await preview.click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  expect(response.headers()['content-disposition']).toContain('inline;');
  expect(response.headers()['content-type']).toContain('application/pdf');
  expect(Number(response.headers()['content-length'])).toBe(716549);
  const popup = await popupPromise;
  // Headless Chromium hands PDF navigation to its download handler instead of painting a viewer.
  expect(response.request().isNavigationRequest()).toBe(true);
  await popup.close();
  const downloading = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download Sample PDF' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('sample-training-certificate-v1.pdf');
  await download.saveAs('test-results/screenshots/ui05-sample-training.pdf');
  const file = await download.path();
  if (!file) throw new Error('Missing sample download');
  expect(
    createHash('sha256')
      .update(await readFile(file))
      .digest('hex'),
  ).toBe(hash);
  const afterResponse = await page.request.get('/api/v1/student/documents');
  expect(afterResponse.status()).toBe(200);
  expect(studentDocumentListSchema.parse(await afterResponse.json())).toEqual(initialDocuments);
  await expect(page.locator('main').getByRole('article')).toHaveCount(initialDocuments.data.length);
  const staff = await page.request.get('/api/v1/certificate-templates');
  expect(staff.status()).toBe(401);
});
test('anonymous users cannot read the sample or bypass the existing student portal authentication', async ({
  page,
}) => {
  const response = await page.request.get(path);
  expect(response.status()).toBe(401);
  expect(response.headers()['cache-control']).toBe('no-store');
  await page.goto('/student/documents');
  await expect(page).toHaveURL(/\/student\/login/);
});
