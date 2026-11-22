import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  capture,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  fixtures,
  signIn,
} from './support';

test('reports: real aggregate rows, CSV download and print view for an administrator', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, fixtures().admin);
  await page.goto('/admin/reports');
  await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();
  const table = page.getByRole('table', { name: 'Enrolment report' });
  await expect(table).toBeVisible();
  await expect(table.getByRole('rowheader', { name: 'Total' })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await capture(page, 'admin-reports-desktop');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^docversity-enrolment-\d{4}-\d{2}-\d{2}\.csv$/);
  const path = await download.path();
  const csv = (await readFile(path, 'utf8')).replace(/^\uFEFF/, '');
  expect(csv.split('\r\n')[0]).toBe(
    'Course code,Course,Academic session,Registration status,Registrations',
  );

  await page.getByRole('combobox', { name: 'Report' }).click();
  await page.getByRole('option', { name: 'Student messages' }).click();
  await expect(page).toHaveURL(/report=student-messages/);
  await expect(page.getByLabel('From (UTC)')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Course' })).toHaveCount(0);

  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('button', { name: 'Download CSV' })).toBeHidden();
  await page.emulateMedia({ media: 'screen' });

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
});

test('reports: a viewer sees only the reports their role may read', async ({ page }) => {
  await signIn(page, fixtures().viewer);
  await page.goto('/admin/reports');
  await expect(page.getByRole('table', { name: 'Enrolment report' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Report' }).click();
  await expect(page.getByRole('option')).toHaveText(['Enrolment', 'Official documents', 'Results']);
  // The API enforces the same boundary.
  const denied = await page.request.get('/api/v1/reports/student-messages');
  expect(denied.status()).toBe(403);
});
