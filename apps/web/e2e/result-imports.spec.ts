import { expect, test, type Page } from '@playwright/test';
import { buildWorkbook } from '@docversity/imports/testing';
import {
  fixtures,
  signIn,
  uniqueCode,
  capture,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
} from './support';

async function staffApi(page: Page, path: string, data: object) {
  const { csrfToken } = (await (await page.request.get('/api/v1/auth/csrf')).json()) as {
    csrfToken: string;
  };
  const response = await page.request.post(`/api/v1/${path}`, {
    data,
    headers: { 'X-CSRF-Token': csrfToken },
  });
  expect(response.status(), `${path}: ${await response.text()}`).toBeLessThan(300);
  return (await response.json()) as { id: string; registrations?: { id: string }[] };
}
async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: option }).click();
}
for (const structure of ['SEMESTER_WISE', 'YEAR_WISE'] as const) {
  test(`${structure}: upload, mapping, preview and safe report on desktop and mobile`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const f = fixtures();
    await signIn(page, f.admin);
    const courseCode = uniqueCode('E2E-RES');
    const course = await staffApi(page, 'programs', {
      code: courseCode,
      name: `Synthetic ${structure} results`,
      level: 'CERTIFICATE',
      durationValue: 1,
      durationUnit: 'YEARS',
      academicStructure: structure,
      periodCount: structure === 'SEMESTER_WISE' ? 2 : 1,
    });
    const curriculum = await staffApi(page, `programs/${course.id}/curricula`, {
      versionCode: uniqueCode('V'),
      name: 'Synthetic results curriculum',
    });
    const subjectCode = uniqueCode('E2E-RSB');
    const subject = await staffApi(page, 'subjects', {
      code: subjectCode,
      name: 'Synthetic marks subject',
      category: 'THEORY',
    });
    await staffApi(page, `curricula/${curriculum.id}/subjects`, {
      subjectId: subject.id,
      periodNumber: 1,
      classification: 'THEORY',
      maxMarks: 100,
    });
    await staffApi(page, `curricula/${curriculum.id}/activate`, {});
    const registration = `00${uniqueCode('E2E')}`;
    const student = await staffApi(page, 'students', {
      student: { fullName: 'Synthetic results learner' },
      registration: {
        registrationNumber: registration,
        programId: course.id,
        academicSessionId: f.examProgram.sessionId,
      },
    });
    const registrationId = student.registrations?.[0]?.id;
    if (!registrationId) throw new Error('missing synthetic registration');
    await staffApi(page, `curricula/${curriculum.id}/registrations`, {
      registrationIds: [registrationId],
    });
    const examCode = uniqueCode('E2E-REX');
    const exam = await staffApi(page, 'examinations', {
      code: examCode,
      name: 'Synthetic result preview examination',
      curriculumId: curriculum.id,
      academicSessionId: f.examProgram.sessionId,
      periodNumber: 1,
      kind: 'REGULAR',
      examSession: 'Synthetic October 2026',
    });
    await staffApi(page, `examinations/${exam.id}/open`, {});
    await page.goto('/admin/results/import');
    await choose(page, 'Course', new RegExp(courseCode));
    await choose(page, 'Curriculum version', /Synthetic results curriculum/);
    await choose(page, structure === 'YEAR_WISE' ? 'Year' : 'Semester', /1 · 1 subjects/);
    await page.getByLabel('Academic session', { exact: true }).click();
    await page.getByRole('option').first().click();
    await choose(page, 'Examination', new RegExp(examCode));
    await capture(page, `results-context-${structure.toLowerCase()}-desktop`);
    const bytes = await buildWorkbook([
      {
        name: 'Results',
        rows: [
          ['Registration Number', 'Subject Code', 'Total Marks'],
          [registration, subjectCode, 85],
          ['UNKNOWN-E2E', subjectCode, -1],
        ],
      },
    ]);
    await page.locator('input[type="file"]').setInputFiles({
      name: 'synthetic-results.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(bytes),
    });
    await page.getByRole('button', { name: 'Upload and map columns' }).click();
    await expect(page).toHaveURL(/\/admin\/results\/import\/[^/]+$/);
    await expect(
      page.getByText('Preview only — no marks have been saved to official records.'),
    ).toBeVisible();
    await expect(page.getByLabel('Registration Number (required)')).toContainText(
      'Registration Number',
    );
    await choose(page, 'Registration Number (required)', 'Not mapped');
    await page.getByRole('button', { name: '4. Validate and preview' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'The request is invalid.' }),
    ).toContainText('Choose the column for Registration Number.');
    await choose(page, 'Registration Number (required)', 'A · Registration Number');
    await page.getByRole('button', { name: '4. Validate and preview' }).click();
    await expect(page.getByRole('status')).toContainText(
      '2 rows: 1 valid, 0 with warnings, 1 with errors.',
    );
    await expect(page.getByRole('table', { name: 'Results preview rows' })).toContainText(
      registration,
    );
    await expectNoSeriousA11yViolations(page);
    await capture(page, `results-preview-${structure.toLowerCase()}-desktop`);
    await page.getByRole('button', { name: 'Errors (1)', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Results preview rows' })).not.toContainText(
      registration,
    );
    await expect(page.getByRole('table', { name: 'Results preview rows' })).toContainText(
      'NEGATIVE_MARKS_NOT_ALLOWED',
    );
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download error report', exact: true }).click();
    expect((await download).suggestedFilename()).toBe('results-preview-issues.xlsx');
    await page.reload();
    await expect(page.getByRole('status')).toContainText('2 rows: 1 valid');
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page);
    await capture(page, `results-preview-${structure.toLowerCase()}-mobile`);
    await page.getByRole('button', { name: 'Discard preview and start again' }).click();
    await expect(page).toHaveURL('/admin/results/import');
  });
}
test('viewer cannot upload or inspect a results preview', async ({ page }) => {
  await signIn(page, fixtures().viewer);
  await page.goto('/admin/results/import');
  await expect(page.getByRole('heading', { name: 'You don’t have access to this' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload and map columns' })).toHaveCount(0);
});
