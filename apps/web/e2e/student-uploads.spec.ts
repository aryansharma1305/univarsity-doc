import { expect, test } from '@playwright/test';
import {
  capture,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  fixtures,
  signIn,
  studentSignIn,
  syntheticPng,
} from './support';

/** A minimal, synthetic, static one-page PDF (no real document content). */
const PDF = Buffer.from(
  [
    '%PDF-1.4',
    '% SYNTHETIC',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >> endobj',
    'trailer << /Root 1 0 R >>',
    '%%EOF',
    '',
  ].join('\n'),
  'latin1',
);
const FILE = '/api/v1/student/uploads/ACADEMIC_CLASS_10/file';

test('a student uploads, replaces and deletes their own file; registrar views it read-only', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const student = fixtures().profileStudents[2];
  const other = fixtures().profileStudents[1];
  if (!student || !other) throw new Error('Missing synthetic students');
  await studentSignIn(page, student);
  await page.goto('/student/documents');
  const academic = page.getByRole('list', { name: 'Academic documents' });
  await expect(
    page.getByRole('list', { name: 'Identity documents' }).getByRole('heading'),
  ).toHaveText(['National ID', 'Passport', 'PAN Card', 'Driving Licence', 'Other Identity Proof']);

  await academic.locator('input[type="file"]').first().setInputFiles({
    name: 'class-10.pdf',
    mimeType: 'application/pdf',
    buffer: PDF,
  });
  await expect(academic.getByText('File uploaded.')).toBeVisible();
  await academic
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: 'class-10.png',
      mimeType: 'image/png',
      buffer: await syntheticPng(page, 600, 800),
    });
  await expect(academic.getByText('File replaced.')).toBeVisible();
  const own = await page.request.get(`${FILE}?disposition=inline`);
  expect(own.status()).toBe(200);
  expect(own.headers()['content-type']).toBe('image/png');
  expect(own.headers()['cache-control']).toBe('private, no-store');

  for (const [width, height, label] of [
    [1440, 1000, 'desktop'],
    [1024, 900, 'laptop'],
    [390, 844, 'mobile'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page);
    await capture(page, `student-uploads-${label}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Another student can never read it.
  const intruder = await browser.newContext();
  const intruderPage = await intruder.newPage();
  await studentSignIn(intruderPage, other);
  expect((await intruderPage.request.get(FILE)).status()).toBe(404);
  await intruder.close();

  // REGISTRAR sees it read-only in the student record; VIEWER has no access.
  const staffContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const staff = await staffContext.newPage();
  await signIn(staff, fixtures().registrar);
  await staff.goto(`/admin/students/${student.studentId}`);
  await staff.getByRole('tab', { name: 'Student uploads' }).click();
  const panel = staff.getByRole('region', { name: 'Student uploads' });
  const download = panel.getByRole('link', { name: 'Download Class 10 / School Certificate' });
  await expect(download).toBeVisible();
  await expect(panel.getByRole('button')).toHaveCount(0);
  const staffFile = await staff.request.get((await download.getAttribute('href')) ?? '');
  expect(staffFile.status()).toBe(200);
  expect(staffFile.headers()['cache-control']).toBe('private, no-store');
  await expectNoSeriousA11yViolations(staff);
  await capture(staff, 'admin-student-uploads-desktop');
  await staff.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(staff);
  await staffContext.close();

  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await signIn(viewer, fixtures().viewer);
  await viewer.goto(`/admin/students/${student.studentId}`);
  await expect(viewer.getByRole('tab', { name: 'Student uploads' })).toHaveCount(0);
  expect((await viewer.request.get(`/api/v1/students/${student.studentId}/uploads`)).status()).toBe(
    403,
  );
  await viewerContext.close();

  // The student deletes it after confirming.
  await academic.getByRole('button', { name: 'Delete Class 10 / School Certificate' }).click();
  await academic
    .getByRole('button', { name: 'Confirm delete Class 10 / School Certificate' })
    .click();
  await expect(academic.getByText('File deleted.')).toBeVisible();
  expect((await page.request.get(FILE)).status()).toBe(404);
});
