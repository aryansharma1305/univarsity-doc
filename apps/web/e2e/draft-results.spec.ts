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
async function post(page: Page, path: string, data: object) {
  const { csrfToken } = (await (await page.request.get('/api/v1/auth/csrf')).json()) as {
    csrfToken: string;
  };
  const response = await page.request.post(`/api/v1/${path}`, {
    data,
    headers: { 'X-CSRF-Token': csrfToken },
  });
  expect(response.status(), await response.text()).toBeLessThan(300);
  return (await response.json()) as { id: string; registrations?: { id: string }[] };
}
async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: option }).click();
}
for (const structure of ['SEMESTER_WISE', 'YEAR_WISE'] as const) {
  test(`${structure}: manual draft, reopen, audited edit and confirmed Excel draft import`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const f = fixtures();
    await signIn(page, f.admin);
    const courseCode = uniqueCode('DRC'),
      subjectCode = uniqueCode('DRS'),
      examCode = uniqueCode('DRE');
    const course = await post(page, 'programs', {
      code: courseCode,
      name: 'Synthetic draft results course',
      level: 'CERTIFICATE',
      durationValue: 1,
      durationUnit: 'YEARS',
      academicStructure: structure,
      periodCount: structure === 'SEMESTER_WISE' ? 2 : 1,
    });
    const curriculum = await post(page, `programs/${course.id}/curricula`, {
      versionCode: uniqueCode('DRV'),
      name: 'Synthetic draft curriculum',
    });
    const subject = await post(page, 'subjects', {
      code: subjectCode,
      name: 'Synthetic assessed subject',
      category: 'THEORY',
    });
    await post(page, `curricula/${curriculum.id}/subjects`, {
      subjectId: subject.id,
      periodNumber: 1,
      classification: 'THEORY',
      maxMarks: 100,
      components: [
        { name: 'Internal', maxMarks: 30 },
        { name: 'External', maxMarks: 70 },
      ],
    });
    await post(page, `curricula/${curriculum.id}/activate`, {});
    const registration = `00${uniqueCode('DR')}`;
    const student = await post(page, 'students', {
      student: { fullName: 'Synthetic draft learner' },
      registration: {
        registrationNumber: registration,
        programId: course.id,
        academicSessionId: f.examProgram.sessionId,
      },
    });
    const registrationId = student.registrations?.[0]?.id;
    if (!registrationId) throw new Error('Synthetic registration missing');
    await post(page, `curricula/${curriculum.id}/registrations`, {
      registrationIds: [registrationId],
    });
    const exam = await post(page, 'examinations', {
      code: examCode,
      name: 'Synthetic marks examination',
      curriculumId: curriculum.id,
      academicSessionId: f.examProgram.sessionId,
      periodNumber: 1,
      kind: 'REGULAR',
      examSession: 'Synthetic October 2026',
    });
    await post(page, `examinations/${exam.id}/open`, {});
    async function context() {
      await choose(page, 'Course', new RegExp(courseCode));
      await choose(page, 'Curriculum version', /Synthetic draft curriculum/);
      await choose(
        page,
        structure === 'YEAR_WISE' ? 'Year' : 'Semester',
        structure === 'YEAR_WISE' ? 'Year 1' : 'Semester 1',
      );
      await choose(page, 'Academic session', /.+/);
      await choose(page, 'Examination', new RegExp(examCode));
    }
    await page.goto('/admin/results/new');
    await context();
    await page.getByLabel('Registration number', { exact: true }).fill(registration);
    await page.getByRole('button', { name: 'Find eligible student' }).click();
    await choose(page, 'Subject', new RegExp(subjectCode));
    await page.getByLabel('Internal marks (required before review)', { exact: true }).fill('0');
    await page.getByRole('button', { name: 'Save as DRAFT' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'DRAFT saved' })).toContainText(
      'Version 1',
    );
    await expect(page.getByText('External marks: missing. Enter before review.')).toBeVisible();
    await expect(
      page.getByText('Draft saved. No results were published.', { exact: true }),
    ).toBeHidden({ timeout: 10000 });
    await expectNoSeriousA11yViolations(page);
    await capture(page, `draft-entry-${structure.toLowerCase()}-desktop`);
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(page);
    await expect(
      page.getByText('Draft saved. No results were published.', { exact: true }),
    ).toBeHidden({ timeout: 10000 });
    await expectNoSeriousA11yViolations(page);
    await capture(page, `draft-entry-${structure.toLowerCase()}-mobile`);
    await page.goto('/admin/results');
    await page
      .getByRole('article')
      .filter({ hasText: registration })
      .getByRole('link', { name: 'Open draft' })
      .click();
    await page.getByRole('button', { name: 'Load applicable components' }).click();
    await expect(
      page.getByLabel('Internal marks (required before review)', { exact: true }),
    ).toHaveValue('0');
    await page.getByLabel('External marks (required before review)', { exact: true }).fill('62.25');
    await page.getByRole('button', { name: 'Save as DRAFT' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'DRAFT saved' })).toContainText(
      'Version 2',
    );
    await page.getByText(/Edited draft/).click();
    await expect(page.getByText('External marks: Missing → 62.25')).toBeVisible();
    const reg2 = `00${uniqueCode('DR2')}`;
    const student2 = await post(page, 'students', {
      student: { fullName: 'Synthetic import learner' },
      registration: {
        registrationNumber: reg2,
        programId: course.id,
        academicSessionId: f.examProgram.sessionId,
      },
    });
    await post(page, `curricula/${curriculum.id}/registrations`, {
      registrationIds: [student2.registrations?.[0]?.id],
    });
    await page.goto('/admin/results/import');
    await context();
    const bytes = await buildWorkbook([
      {
        name: 'Results',
        rows: [
          ['Registration Number', 'Subject Code', 'Internal Marks', 'External Marks'],
          [reg2, subjectCode, '20', '65'],
          ['UNKNOWN', subjectCode, '5', '75'],
        ],
      },
    ]);
    await page.locator('input[type=file]').setInputFiles({
      name: 'synthetic-drafts.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(bytes),
    });
    await page.getByRole('button', { name: /Upload and map columns/i }).click();
    await page.getByRole('button', { name: /Validate and preview/ }).click();
    await page.getByRole('button', { name: 'Review draft save plan' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'to create' })).toContainText(
      '1 to create',
    );
    await expect(
      page.getByRole('button', { name: 'Save Valid Rows as Drafts', exact: true }),
    ).toBeDisabled();
    await page.getByRole('checkbox', { name: /I confirm saving/ }).check();
    await expectNoSeriousA11yViolations(page);
    await capture(page, `draft-import-${structure.toLowerCase()}-mobile`);
    await page.getByRole('button', { name: 'Save Valid Rows as Drafts', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Draft batch saved' })).toContainText(
      '1 created',
    );
    await expect(
      page.getByText(
        'Internal drafts have been saved. No results have been approved or published.',
      ),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText(
        'Internal drafts have been saved. No results have been approved or published.',
      ),
    ).toBeVisible();
    await page.goto('/admin/results');
    await expect(page.getByRole('article').filter({ hasText: reg2 })).toContainText('DRAFT');
  });
}
test('viewer can read drafts but cannot enter marks', async ({ page }) => {
  await signIn(page, fixtures().viewer);
  await page.goto('/admin/results/new');
  await expect(page.getByText('You don’t have access to this')).toBeVisible();
});
