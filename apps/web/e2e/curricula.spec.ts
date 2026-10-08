import { type Locator, type Page, expect, test } from '@playwright/test';
import {
  capture,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  fixtures,
  openSection,
  signIn,
  uniqueCode,
} from './support';

// Synthetic courses and subjects only — created through the real UI and API (no mocks).
const shared = {
  semesterCourse: '',
  semesterCurriculumUrl: '',
  yearCurriculumUrl: '',
  physicsCode: '',
};

async function choose(page: Page, dialog: Locator, label: string, option: string | RegExp) {
  await dialog.getByLabel(label).click();
  await page.getByRole('option', { name: option, exact: typeof option === 'string' }).click();
}

async function createCourse(
  page: Page,
  input: { code: string; name: string; structure: 'Semester-wise' | 'Year-wise'; periods: string },
) {
  await openSection(page, 'Course Management');
  await page.getByRole('button', { name: 'Create course' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Create course' });
  await dialog.getByLabel('Course name').fill(input.name);
  await dialog.getByLabel('Course code').fill(input.code);
  await dialog.getByLabel('Course type').fill('CERTIFICATE');
  await dialog
    .getByRole('spinbutton', { name: /^Duration/ })
    .fill(input.periods === '2' ? '1' : '2');
  await choose(page, dialog, 'Duration unit', 'Years');
  await choose(page, dialog, 'Academic structure', input.structure);
  await dialog
    .getByLabel(input.structure === 'Year-wise' ? 'Number of years' : 'Number of semesters')
    .fill(input.periods);
  return dialog;
}

async function newVersion(page: Page, versionCode: string, name: string) {
  await page.getByRole('button', { name: 'New version' }).click();
  const dialog = page.getByRole('dialog', { name: 'New curriculum version' });
  await dialog.getByLabel('Version code').fill(versionCode);
  await dialog.getByRole('textbox', { name: /^Name/ }).fill(name);
  await dialog.getByRole('button', { name: 'Create draft' }).click();
  await expect(page).toHaveURL(/\/admin\/programs\/[0-9a-f-]+\/curricula\/[0-9a-f-]+$/);
}

/** Opens "Add subject" in the current period and creates a brand-new catalogue subject inline. */
async function addNewSubject(
  page: Page,
  input: {
    code: string;
    title: string;
    category?: string;
    credits?: string;
    max?: string;
    pass?: string;
  },
) {
  await page.getByRole('button', { name: 'Add subject' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add subject' });
  await dialog.getByRole('button', { name: /Create a new subject/ }).click();
  const subject = page.getByRole('dialog', { name: 'Add subject to catalogue' });
  await subject.getByLabel('Subject code').fill(input.code);
  await subject.getByLabel('Subject title').fill(input.title);
  if (input.category) await choose(page, subject, 'Category', input.category);
  await subject.getByRole('button', { name: 'Add subject' }).click();
  await expect(subject).toBeHidden();
  await expect(
    dialog.getByRole('button', { name: new RegExp(input.code.toUpperCase()), pressed: true }),
  ).toBeVisible();
  if (input.credits) await dialog.getByLabel('Credits').fill(input.credits);
  if (input.max) await dialog.getByLabel('Maximum marks').fill(input.max);
  if (input.pass) await dialog.getByLabel('Passing marks').fill(input.pass);
  return dialog;
}

test.describe.configure({ mode: 'serial' });

test('a registrar builds and activates a semester-wise course curriculum', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page, fixtures().registrar);

  // 1. Semester-wise course.
  shared.semesterCourse = uniqueCode('CERT');
  const courseDialog = await createCourse(page, {
    code: shared.semesterCourse,
    name: 'E2E Certificate in Synthetic Ultrasound',
    structure: 'Semester-wise',
    periods: '2',
  });
  await expectNoSeriousA11yViolations(page);
  await capture(page, 'course-create-desktop');
  await courseDialog.getByRole('button', { name: 'Create course' }).click();
  await expect(page.getByText(`Course ${shared.semesterCourse} created`)).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: shared.semesterCourse });
  await expect(row).toContainText('Semester-wise · 2 semesters');
  await capture(page, 'course-list-desktop');

  // 2. Curriculum version.
  await row.getByRole('link', { name: 'E2E Certificate in Synthetic Ultrasound' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'E2E Certificate in Synthetic Ultrasound' }),
  ).toBeVisible();
  await expect(page.getByText('No curriculum versions yet')).toBeVisible();
  await newVersion(page, '2026', '2026 syllabus');
  await expect(page.getByRole('heading', { level: 1, name: '2026 · 2026 syllabus' })).toBeVisible();
  await expect(page.getByText('Draft', { exact: true })).toBeVisible();
  shared.semesterCurriculumUrl = page.url();

  // 3. Semester 1 and Semester 2 subjects (created in the catalogue inline, with components).
  await expect(page.getByRole('tab', { name: /Semester 1/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  shared.physicsCode = uniqueCode('ULT');
  let dialog = await addNewSubject(page, {
    code: shared.physicsCode,
    title: 'E2E Ultrasound Physics',
    credits: '4',
    max: '100',
    pass: '40',
  });
  await dialog.getByRole('button', { name: 'Add component' }).click();
  await dialog.getByRole('textbox', { name: /^Component/ }).fill('Internal assessment');
  await dialog.getByRole('spinbutton', { name: /^Max(?!imum)/ }).fill('40');
  await dialog.getByRole('button', { name: 'Add component' }).click();
  await dialog
    .getByRole('textbox', { name: /^Component/ })
    .nth(1)
    .fill('External examination');
  await dialog
    .getByRole('spinbutton', { name: /^Max(?!imum)/ })
    .nth(1)
    .fill('50');
  await dialog.getByRole('button', { name: 'Add subject', exact: true }).click();
  await expect(
    dialog.getByText(/components add up to 90, but maximum marks are 100/),
  ).toBeVisible();
  await dialog
    .getByRole('spinbutton', { name: /^Max(?!imum)/ })
    .nth(1)
    .fill('60');
  await expectNoSeriousA11yViolations(page);
  await capture(page, 'curriculum-subject-assignment-desktop');
  await dialog.getByRole('button', { name: 'Add subject', exact: true }).click();
  await expect(dialog).toBeHidden();

  const careCode = uniqueCode('PTC');
  dialog = await addNewSubject(page, { code: careCode, title: 'E2E Patient Care', credits: '3' });
  await dialog.getByRole('button', { name: 'Add subject', exact: true }).click();
  await expect(dialog).toBeHidden();
  const semester1 = page.getByRole('table', { name: 'Subjects in Semester 1' });
  await expect(semester1.getByRole('row')).toHaveCount(3);
  // Reorder: Patient Care first.
  await page.getByRole('button', { name: `Move ${careCode} up` }).click();
  await expect(semester1.getByRole('row').nth(1)).toContainText(careCode);
  await expect(semester1).toContainText('Internal assessment 40 · External examination 60');

  await page.getByRole('tab', { name: /Semester 2/ }).click();
  dialog = await addNewSubject(page, {
    code: uniqueCode('SCN'),
    title: 'E2E Scanning Practice',
    category: 'Practical',
    credits: '6',
  });
  await expect(dialog.getByLabel('Semester')).toContainText('Semester 2');
  await dialog.getByRole('button', { name: 'Add subject', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('table', { name: 'Subjects in Semester 2' })).toContainText(
    'Practical',
  );
  await expectNoSeriousA11yViolations(page);
  await capture(page, 'curriculum-semester-editor-desktop');

  // 4. Activation is an explicit, confirmed action.
  await page.getByRole('button', { name: 'Activate curriculum' }).click();
  const confirm = page.getByRole('dialog', { name: 'Activate version 2026?' });
  await expect(confirm).toContainText('3 subject assignment(s) become read-only');
  await capture(page, 'curriculum-activate-confirm-desktop');
  await confirm.getByRole('button', { name: 'Activate curriculum' }).click();
  await expect(page.getByText('Version 2026 activated')).toBeVisible();

  // 5. The activated version is read-only.
  await page.reload();
  await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Read-only: this version is active/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add subject' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Edit E2E|^Edit ULT|^Edit PTC/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Move / })).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
  await capture(page, 'curriculum-active-readonly-desktop');
  await page.getByRole('link', { name: new RegExp(`${shared.semesterCourse} —`) }).click();
  await expect(page.getByRole('link', { name: /Open curriculum 2026/ })).toContainText('Active');
  await capture(page, 'course-detail-desktop');
  expect(errors).toEqual([]);
});

test('a registrar builds a year-wise course and reuses a catalogue subject', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, fixtures().registrar);
  const code = uniqueCode('DIP');
  const courseDialog = await createCourse(page, {
    code,
    name: 'E2E Diploma in Synthetic Imaging',
    structure: 'Year-wise',
    periods: '2',
  });
  await courseDialog.getByRole('button', { name: 'Create course' }).click();
  await expect(page.getByText(`Course ${code} created`)).toBeVisible();
  await page.getByRole('link', { name: 'E2E Diploma in Synthetic Imaging' }).first().click();
  await newVersion(page, 'Y2026', '2026 year-wise syllabus');
  shared.yearCurriculumUrl = page.url();
  await expect(page.getByRole('tab', { name: /Year 1/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Year 2/ })).toBeVisible();

  // Reuse the subject created for the semester-wise course instead of duplicating it.
  await page.getByRole('button', { name: 'Add subject' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add subject' });
  await dialog.getByRole('textbox', { name: 'Subject' }).fill(shared.physicsCode);
  await dialog.getByRole('button', { name: new RegExp(shared.physicsCode) }).click();
  await expect(dialog.getByLabel('Year')).toContainText('Year 1');
  await dialog.getByLabel('Credits').fill('8');
  await dialog.getByRole('button', { name: 'Add subject', exact: true }).click();
  await expect(dialog).toBeHidden();
  const year1 = page.getByRole('table', { name: 'Subjects in Year 1' });
  await expect(year1).toContainText(shared.physicsCode);
  await expect(year1).toContainText('8');
  await expectNoSeriousA11yViolations(page);
  await capture(page, 'curriculum-year-editor-desktop');

  // A duplicate code is refused in the catalogue (case-insensitive).
  await openSection(page, 'Subject Catalogue');
  await page.getByLabel('Search subjects').fill(shared.physicsCode);
  const subjectRow = page.getByRole('row').filter({ hasText: shared.physicsCode });
  await expect(subjectRow).toContainText('2 curricula');
  await page.getByRole('button', { name: 'Add subject' }).first().click();
  const create = page.getByRole('dialog', { name: 'Add subject to catalogue' });
  await create.getByLabel('Subject code').fill(shared.physicsCode.toLowerCase());
  await create.getByLabel('Subject title').fill('Duplicate');
  await create.getByRole('button', { name: 'Add subject' }).click();
  await expect(create.getByText(/already exists\. Reuse it from the catalogue/)).toBeVisible();
  await capture(page, 'subject-create-desktop');
  await create.getByRole('button', { name: 'Cancel' }).click();
  await expectNoSeriousA11yViolations(page);
  await capture(page, 'subject-catalogue-desktop');
});

test('read-only staff can view curricula but cannot change them', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await signIn(page, fixtures().viewer);
  await page.goto(shared.semesterCurriculumUrl);
  await expect(page.getByRole('heading', { level: 1, name: '2026 · 2026 syllabus' })).toBeVisible();
  for (const name of [
    'Add subject',
    'Activate curriculum',
    'Archive',
    'Edit details',
    'Set end date',
  ]) {
    await expect(page.getByRole('button', { name })).toHaveCount(0);
  }
  await page.goto(shared.yearCurriculumUrl);
  await expect(page.getByRole('tab', { name: /Year 1/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add subject' })).toHaveCount(0);
  // The API refuses mutations regardless of the interface.
  const id = shared.yearCurriculumUrl.split('/').at(-1) ?? '';
  const { csrfToken } = (await (await page.request.get('/api/v1/auth/csrf')).json()) as {
    csrfToken: string;
  };
  for (const path of [`curricula/${id}/activate`, `curricula/${id}/archive`]) {
    const response = await page.request.post(`/api/v1/${path}`, {
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(response.status()).toBe(403);
  }
  const patch = await page.request.patch(`/api/v1/curricula/${id}`, {
    headers: { 'X-CSRF-Token': csrfToken },
    data: { name: 'Changed by a viewer' },
  });
  expect(patch.status()).toBe(403);
  await context.close();
});

test('course management screens fit desktop, laptop, tablet and phone widths', async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, fixtures().registrar);
  const screens: [string, string][] = [
    ['course-list', '/admin/programs'],
    ['curriculum-list', shared.semesterCurriculumUrl.split('/curricula/')[0] ?? ''],
    ['curriculum-semester-editor', shared.semesterCurriculumUrl],
    ['curriculum-year-editor', shared.yearCurriculumUrl],
    ['subject-catalogue', '/admin/subjects'],
  ];
  for (const [width, label] of [
    [1440, 'desktop'],
    [1280, 'laptop'],
    [768, 'tablet'],
    [390, 'mobile'],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, url] of screens) {
      await page.goto(url);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectNoSeriousA11yViolations(page);
      await capture(page, `${name}-${label}`);
    }
    // Inspect form and lifecycle surfaces at the same four device widths.
    await page.goto('/admin/programs');
    await page.getByRole('button', { name: 'Create course' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Create course' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page);
    await capture(page, `course-create-${label}`);
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

    await page.goto('/admin/subjects');
    await page.getByRole('button', { name: 'Add subject' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Add subject to catalogue' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page);
    await capture(page, `subject-create-${label}`);
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

    await page.goto(shared.yearCurriculumUrl);
    await page.getByRole('button', { name: 'Add subject' }).click();
    const assignment = page.getByRole('dialog', { name: 'Add subject' });
    await expect(assignment).toBeVisible();
    await assignment.getByRole('textbox', { name: 'Subject' }).fill('E2E Patient Care');
    await assignment.getByRole('button', { name: /E2E Patient Care/ }).click();
    await assignment.getByLabel('Maximum marks').fill('100');
    await assignment.getByLabel('Passing marks').fill('40');
    await assignment.evaluate((element) => {
      element.scrollTo(0, 0);
    });
    expect(
      await assignment.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page);
    await capture(page, `curriculum-subject-assignment-${label}`);
    await assignment.getByRole('button', { name: 'Cancel' }).click();

    await page.goto(shared.semesterCurriculumUrl);
    await page.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Archive version 2026?' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page);
    await capture(page, `curriculum-archive-confirm-${label}`);
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  }
  // Phone: the curriculum editor stays usable (tabs, subject cards, students tab).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(shared.semesterCurriculumUrl);
  await page.getByRole('tab', { name: /Semester 2/ }).click();
  await expect(page.getByRole('list', { name: 'Subjects in Semester 2' })).toContainText(
    'E2E Scanning Practice',
  );
  await page.getByRole('tab', { name: 'Students' }).click();
  await expect(page.getByRole('heading', { name: 'Students' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);
  await capture(page, 'curriculum-students-mobile');
  await page.goto('/admin/programs');
  await page.getByRole('button', { name: 'Create course' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Create course' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, 'course-create-mobile');
});

test('staff explicitly assign a curriculum and the student sees only their own course subjects', async ({
  page,
  browser,
}) => {
  await signIn(page, fixtures().registrar);
  const account = fixtures().profileStudents[0];
  if (!account) throw new Error('Synthetic student account missing');
  const csrf = await page.request.get('/api/v1/auth/csrf');
  const { csrfToken } = (await csrf.json()) as { csrfToken: string };
  const studentResponse = await page.request.get(`/api/v1/students/${account.studentId}`);
  expect(studentResponse.status()).toBe(200);
  const student = (await studentResponse.json()) as {
    registrations: { academicSession: { id: string } }[];
  };
  const academicSessionId = student.registrations[0]?.academicSession.id;
  expect(academicSessionId).toBeTruthy();
  const programId = new URL(shared.semesterCurriculumUrl).pathname.split('/')[3];
  const number = uniqueCode('E2E-CUR-REG');
  const create = await page.request.post('/api/v1/registrations', {
    headers: { 'X-CSRF-Token': csrfToken },
    data: {
      studentId: account.studentId,
      registrationNumber: number,
      programId,
      academicSessionId,
    },
  });
  expect(create.status()).toBe(201);
  await page.goto(shared.semesterCurriculumUrl);
  await page.getByRole('tab', { name: 'Students' }).click();
  await page.getByLabel(`Select ${number}`).check();
  await page.getByRole('button', { name: 'Assign to 2026' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'registration(s) assigned to 2026' }),
  ).toContainText('1 registration(s)');
  await expect(page.getByRole('list', { name: 'Registrations of this course' })).toContainText(
    'This version',
  );
  await expectNoSeriousA11yViolations(page);
  await capture(page, 'curriculum-students-assigned-desktop');

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const own = await context.newPage();
  await own.goto('/student/login');
  await own.getByLabel('Registration number').fill(account.registrationNumber);
  await own.getByLabel('Password').fill(account.password);
  await own.getByRole('button', { name: 'Sign in' }).click();
  await expect(own).toHaveURL(/\/student$/);
  await own.goto('/student/course');
  await expect(own.getByRole('heading', { name: number })).toBeVisible();
  await expect(own.getByText('2026 syllabus', { exact: false })).toBeVisible();
  await expect(own.getByText('E2E Ultrasound Physics')).toBeVisible();
  await expect(own.getByRole('button', { name: /Edit|Assign/ })).toHaveCount(0);
  await expectNoHorizontalOverflow(own);
  await expectNoSeriousA11yViolations(own);
  await capture(own, 'student-assigned-curriculum-mobile');
  await context.close();
});
