import { readFileSync } from 'node:fs';
import {
  buildWorkbook,
  generatedStudents,
  registration2025Sheet,
  studentSheet,
} from '@docversity/imports/testing';
import { type Page, expect, test } from '@playwright/test';
import {
  capture,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  fixtures,
  openSection,
  signIn,
  uniqueCode,
} from './support';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function uploadWorkbook(page: Page, bytes: Uint8Array, name: string): Promise<void> {
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name, mimeType: XLSX, buffer: Buffer.from(bytes) });
  await expect(page.getByText(name)).toBeVisible();
  await page.getByRole('button', { name: 'Upload and continue' }).click();
  await expect(page).toHaveURL(/\/admin\/imports\/[0-9a-f-]{36}$/);
}

async function mapAndValidate(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Map columns' })).toBeVisible({ timeout: 30_000 });
  // The server suggested every template column; the administrator confirms.
  await expect(page.getByText('13 of 13 fields mapped')).toBeVisible();
  await page.getByRole('button', { name: 'Save mapping and validate' }).click();
  await expect(page.getByRole('heading', { name: 'Validation summary' })).toBeVisible({
    timeout: 30_000,
  });
}

test('REGISTRAR imports students: template → upload → map → validate → review → commit', async ({
  page,
}) => {
  const { registrar, fixture } = fixtures();
  const prefix = uniqueCode('E2E-IMP');
  await signIn(page, registrar);
  await openSection(page, 'Imports');
  await expect(page.getByText('No student imports yet')).toBeVisible();
  await capture(page, 'imports-list-empty-desktop');
  await page.getByRole('link', { name: 'Import students' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Import students' })).toBeVisible();

  // Step 1: the template downloads as a real .xlsx file.
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download template' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('docversity-student-import-template.xlsx');
  expect(
    readFileSync(await download.path())
      .subarray(0, 2)
      .toString(),
  ).toBe('PK');

  // Step 2: upload a generated workbook.
  const bytes = await buildWorkbook([
    studentSheet(
      generatedStudents(3, {
        prefix,
        programCode: fixture.programCode,
        academicSessionCode: fixture.sessionCode,
      }),
    ),
  ]);
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'e2e-students.xlsx', mimeType: XLSX, buffer: Buffer.from(bytes) });
  await expect(page.getByText('e2e-students.xlsx')).toBeVisible();
  await capture(page, 'imports-upload-desktop');
  await expectNoSeriousA11yViolations(page);
  await page.getByRole('button', { name: 'Upload and continue' }).click();
  await expect(page).toHaveURL(/\/admin\/imports\/[0-9a-f-]{36}$/);

  // Step 3: mapping (persisted — survives a reload).
  await expect(page.getByRole('heading', { name: 'Map columns' })).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Map columns' })).toBeVisible();
  await expect(page.locator('[aria-current="step"]')).toContainText('Map columns');
  await capture(page, 'imports-mapping-desktop');
  await expectNoSeriousA11yViolations(page);
  await page.getByRole('button', { name: 'Save mapping and validate' }).click();

  // Steps 4–5: validation summary and review.
  await expect(page.getByRole('heading', { name: 'Validation summary' })).toBeVisible({
    timeout: 30_000,
  });
  const summary = page.locator('dl').filter({ hasText: 'Total rows' });
  await expect(summary).toContainText('Total rows3');
  await expect(summary).toContainText('Errors0');
  await capture(page, 'imports-validation-summary-desktop');
  await expectNoSeriousA11yViolations(page);
  await page.getByRole('button', { name: 'Details of row 2' }).click();
  await expect(page.getByRole('dialog', { name: 'Row 2' })).toContainText(`${prefix}-0001`);
  await page.keyboard.press('Escape');

  // Step 6: commit, real worker progress, completion.
  await page.getByRole('button', { name: 'Import 3 rows' }).click();
  await page.getByRole('button', { name: 'Import now' }).click();
  await expect(page.getByText('Import completed')).toBeVisible({ timeout: 30_000 });
  const report = page.locator('dl').filter({ hasText: 'Rows read' });
  await expect(report).toContainText('Created3');
  await capture(page, 'imports-completed-desktop');

  // The imported student exists in Students.
  await page.getByRole('link', { name: 'View students' }).click();
  await page.getByLabel('Search students').fill(`${prefix}-0002`);
  await expect(page.getByRole('link', { name: 'Test Student 0002' }).first()).toBeVisible();

  await openSection(page, 'Imports');
  await expect(page.getByRole('link', { name: 'e2e-students.xlsx' }).first()).toBeVisible();
  await capture(page, 'imports-list-desktop');
});

test('an invalid workbook shows exact row errors and an error report, and imports nothing invalid', async ({
  page,
}) => {
  const { registrar, fixture } = fixtures();
  const prefix = uniqueCode('E2E-BAD');
  await signIn(page, registrar);
  await page.goto('/admin/imports/new');
  const common = { programCode: fixture.programCode, academicSessionCode: fixture.sessionCode };
  const bytes = await buildWorkbook([
    studentSheet([
      { ...common, registrationNumber: `${prefix}-0001`, fullName: 'Test Student One' },
      {
        ...common,
        registrationNumber: `${prefix}-0002`,
        fullName: 'Test Student Two',
        programCode: 'NO-SUCH-PROGRAM',
      },
      { ...common, registrationNumber: `${prefix}-0003`, fullName: null },
      {
        ...common,
        registrationNumber: `${prefix}-0004`,
        fullName: 'Test Student Four',
        dateOfBirth: '01/02/2004',
      },
      { ...common, registrationNumber: `${prefix}-0001`, fullName: 'Test Student One Again' },
    ]),
  ]);
  await uploadWorkbook(page, bytes, 'e2e-invalid.xlsx');
  await mapAndValidate(page);

  const summary = page.locator('dl').filter({ hasText: 'Total rows' });
  await expect(summary).toContainText('Total rows5');
  await expect(summary).toContainText('Errors5');
  await page.getByRole('button', { name: /^Errors \(5\)/ }).click();
  const table = page.getByRole('table', { name: 'Import rows' });
  await expect(table).toContainText('No program with code or name "NO-SUCH-PROGRAM" exists');
  await expect(table).toContainText('Student Name is missing.');
  await expect(table).toContainText('is ambiguous');
  await expect(table).toContainText(`appears more than once in this file (rows 2, 6)`);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download error report' }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/^import-[0-9a-f]{8}-issues\.xlsx$/);

  // Nothing can be imported: every row has an error.
  await expect(page.getByRole('button', { name: 'Import 0 rows' })).toBeDisabled();
  await expect(page.getByText('There is nothing to import.')).toBeVisible();
});

test('a "Registration 2025"-shaped workbook imports with one session, course names and translated statuses', async ({
  page,
}) => {
  const { registrar } = fixtures();
  await signIn(page, registrar);
  await page.goto('/admin/imports/new');
  const base = 800_000_000 + Math.floor(Math.random() * 90_000_000);
  // Synthetic data with the real workbook's columns: course and school are NAMES, no session column,
  // empty Date of Birth/Photo, "Active"/"Inactive" statuses, fake national IDs.
  const bytes = await buildWorkbook([
    registration2025Sheet(
      Array.from({ length: 4 }, (_, index) => ({
        name: `Test Student ${index + 1}`,
        registrationNumber: base + index,
        courseName: 'E2E Fixture Program',
        schoolName: 'E2E Fixture Department',
        status: index === 3 ? 'Inactive' : 'Active',
      })),
    ),
  ]);
  await uploadWorkbook(page, bytes, 'registration-2025-synthetic.xlsx');
  await expect(page.getByRole('heading', { name: 'Map columns' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Not imported: H “National Id No\.”/)).toBeVisible();

  await page.getByLabel('Academic session for every row').click();
  await page.getByRole('option', { name: /^E2E-SESSION/ }).click();
  await page.getByLabel('Inactive', { exact: true }).click();
  await page.getByRole('option', { name: 'Suspended' }).click();
  await capture(page, 'imports-mapping-registration-2025-desktop');
  await expectNoSeriousA11yViolations(page);
  await page.getByRole('button', { name: 'Save mapping and validate' }).click();

  await expect(page.getByRole('heading', { name: 'Validation summary' })).toBeVisible({
    timeout: 30_000,
  });
  const summary = page.locator('dl').filter({ hasText: 'Total rows' });
  await expect(summary).toContainText('Total rows4');
  await expect(summary).toContainText('Errors0');
  await expect(summary).toContainText('Warnings0');
  await page.getByRole('button', { name: 'Import 4 rows' }).click();
  await page.getByRole('button', { name: 'Import now' }).click();
  await expect(page.getByText('Import completed')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('dl').filter({ hasText: 'Rows read' })).toContainText('Created4');
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('the import workflow works at 390px without page-level horizontal scrolling', async ({
    page,
  }) => {
    const { registrar, fixture } = fixtures();
    const prefix = uniqueCode('E2E-MOB');
    await signIn(page, registrar);
    await page.goto('/admin/imports');
    await expect(page.getByRole('heading', { level: 1, name: 'Imports' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture(page, 'imports-list-mobile');

    await page.goto('/admin/imports/new');
    const bytes = await buildWorkbook([
      studentSheet([
        ...generatedStudents(2, {
          prefix,
          programCode: fixture.programCode,
          academicSessionCode: fixture.sessionCode,
        }),
        {
          registrationNumber: `${prefix}-BAD`,
          fullName: 'Test Bad Row',
          programCode: 'NOPE',
          academicSessionCode: fixture.sessionCode,
        },
      ]),
    ]);
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: 'e2e-mobile.xlsx', mimeType: XLSX, buffer: Buffer.from(bytes) });
    await expect(page.getByText('e2e-mobile.xlsx')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture(page, 'imports-upload-mobile');
    await page.getByRole('button', { name: 'Upload and continue' }).click();

    await expect(page.getByRole('heading', { name: 'Map columns' })).toBeVisible({
      timeout: 30_000,
    });
    await expectNoHorizontalOverflow(page);
    await capture(page, 'imports-mapping-mobile');
    await page.getByRole('button', { name: 'Save mapping and validate' }).click();

    await expect(page.getByRole('heading', { name: 'Validation summary' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('dl').filter({ hasText: 'Total rows' })).toContainText('Errors1');
    await expectNoHorizontalOverflow(page);
    await capture(page, 'imports-validation-summary-mobile');
    // Row cards (not a wide table) on small screens; the error is readable.
    await expect(page.getByRole('list', { name: 'Import rows' })).toContainText(
      'No program with code or name "NOPE" exists',
    );

    await page.getByRole('button', { name: 'Import 2 rows' }).click();
    await page.getByRole('button', { name: 'Import now' }).click();
    await expect(page.getByText('Import completed')).toBeVisible({ timeout: 30_000 });
    await expectNoHorizontalOverflow(page);
    await capture(page, 'imports-completed-mobile');
  });
});
