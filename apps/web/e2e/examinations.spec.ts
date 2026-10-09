import { type Browser, type Page, expect, test } from '@playwright/test';
import {
  type Account,
  type StudentAccount,
  capture,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  fixtures,
  signIn,
  studentSignIn,
} from './support';

/**
 * Phase 9 browser tests. Synthetic data only: the curriculum of the e2e year-wise course is built
 * through the real staff API from the signed-in browser session (so every curriculum rule applies);
 * everything a person would do is done through the UI.
 */

const shared = { curriculumId: '', examinationUrl: '' };

async function staffPage(browser: Browser, account: Account, width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  const page = await context.newPage();
  await signIn(page, account);
  return page;
}

async function studentPage(browser: Browser, student: StudentAccount, width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  const page = await context.newPage();
  await studentSignIn(page, student);
  return page;
}

/** JSON call to the staff API with the session's CSRF token (fixture setup only). */
export async function staffApi(page: Page, method: 'POST' | 'PATCH', path: string, data: object) {
  const csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()) as {
    csrfToken: string;
  };
  const response = await page.request.fetch(`/api/v1/${path}`, {
    method,
    data,
    headers: { 'X-CSRF-Token': csrf.csrfToken },
  });
  expect(response.status(), `${method} ${path}: ${await response.text()}`).toBeLessThan(300);
  return (await response.json()) as { id: string };
}

async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByLabel(label).click();
  await page.getByRole('option', { name: option }).click();
}

test.describe.configure({ mode: 'serial' });

test('examination application links and year-wise examination records reach the right students', async ({
  browser,
}) => {
  const { admin, examAdmin, examStudents, examProgram } = fixtures();
  const [alpha, beta] = examStudents;
  if (!alpha || !beta) throw new Error('missing fixtures');

  // Fixture: an ACTIVE year-wise curriculum (2 years, one subject per year) assigned to both students.
  const setup = await staffPage(browser, admin);
  const curriculum = await staffApi(setup, 'POST', `programs/${examProgram.id}/curricula`, {
    versionCode: 'E2E-2026',
    name: 'E2E Synthetic syllabus 2026',
  });
  for (const [period, name] of [
    [1, 'E2E Synthetic Anatomy'],
    [2, 'E2E Synthetic Physiology'],
  ] as const) {
    const subject = await staffApi(setup, 'POST', 'subjects', {
      code: `E2E-SUB-${String(period)}`,
      name,
      category: 'THEORY',
    });
    await staffApi(setup, 'POST', `curricula/${curriculum.id}/subjects`, {
      subjectId: subject.id,
      periodNumber: period,
      classification: 'THEORY',
    });
  }
  await staffApi(setup, 'POST', `curricula/${curriculum.id}/activate`, {});
  await staffApi(setup, 'POST', `curricula/${curriculum.id}/registrations`, {
    registrationIds: [alpha.registrationId, beta.registrationId],
  });
  shared.curriculumId = curriculum.id;
  await setup.context().close();

  // Before anything is configured, the student sees an honest state.
  const portal = await studentPage(browser, alpha);
  await portal.goto('/student/examinations');
  await expect(portal.getByText('Examination application not configured yet')).toBeVisible();

  // EXAM_ADMIN configures the external examination application (https only).
  const staff = await staffPage(browser, examAdmin);
  await staff
    .getByRole('complementary', { name: 'Admin navigation' })
    .getByRole('link', { name: 'Examinations', exact: true })
    .click();
  await expect(staff.getByRole('heading', { level: 1, name: 'Examinations' })).toBeVisible();
  await staff.getByRole('link', { name: 'Examination application' }).click();
  await staff.getByRole('button', { name: 'Add application' }).click();
  const dialog = staff.getByRole('dialog', { name: 'Add examination application' });
  await dialog.getByLabel(/Application name/).fill('E2E Synthetic Exam App');
  await dialog.getByLabel(/Official website URL/).fill('http://exams.example.test');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(
    dialog.getByText('Enter the full https:// address provided by the university.'),
  ).toBeVisible();
  await dialog.getByLabel(/Official website URL/).fill('https://exams.example.test/portal');
  await dialog.getByLabel(/Android download URL/).fill('https://play.example.test/store/apps/e2e');
  await dialog
    .getByLabel(/Instructions for students/)
    .fill('E2E: sign in with your registration number.');
  await dialog.getByLabel('Show to students (active)').check();
  await expectNoSeriousA11yViolations(staff);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(staff.getByText('Active (shown to students)')).toBeVisible();
  await capture(staff, 'examination-application-desktop');

  // EXAM_ADMIN creates a Year 2 examination record and opens it.
  await staff.goto('/admin/examinations');
  await staff.getByRole('button', { name: 'New examination' }).click();
  const create = staff.getByRole('dialog', { name: 'New examination record' });
  await choose(staff, 'Course', /E2E-EXAM-PROG/);
  await choose(staff, 'Curriculum version', /E2E-2026/);
  await choose(staff, 'Semester / year', 'Year 2');
  await choose(staff, 'Academic session', /E2E-SESSION/);
  await create.getByLabel(/^Code/).fill('E2E-EXM-Y2');
  await create.getByLabel(/^Name/).fill('E2E Year 2 Examination');
  await create.getByLabel(/Examination session/).fill('E2E May–June 2026');
  await expectNoSeriousA11yViolations(staff);
  await capture(staff, 'examination-create-desktop');
  await create.getByRole('button', { name: 'Create draft' }).click();
  await expect(staff).toHaveURL(/\/admin\/examinations\/[0-9a-f-]{36}$/);
  await expect(staff.getByText('Year 2').first()).toBeVisible();
  await staff.getByRole('button', { name: 'Open record' }).click();
  await staff.getByRole('dialog').getByRole('button', { name: 'Open record' }).click();
  await expect(staff.getByText('Open (visible to students)').first()).toBeVisible();
  shared.examinationUrl = staff.url();
  await expectNoSeriousA11yViolations(staff);
  await capture(staff, 'examination-detail-desktop');
  await staff.context().close();

  // The student sees the application card and their year-wise record — exams happen elsewhere.
  await portal.reload();
  await expect(portal.getByText(/not in this portal/)).toBeVisible();
  await expect(portal.getByRole('link', { name: /Open the official website/ })).toHaveAttribute(
    'href',
    'https://exams.example.test/portal',
  );
  await expect(portal.getByRole('link', { name: /for Android/ })).toBeVisible();
  await expect(portal.getByRole('link', { name: /iPhone/ })).toHaveCount(0);
  await expect(portal.getByRole('list', { name: 'Course periods' })).toContainText('Year 1');
  await expect(portal.getByText('E2E Year 2 Examination')).toBeVisible();
  await expectNoSeriousA11yViolations(portal);
  await capture(portal, 'student-examinations-desktop');
  await portal.context().close();
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('examination screens work at 390px', async ({ browser }) => {
    const { examAdmin, examStudents } = fixtures();
    const [alpha] = examStudents;
    if (!alpha) throw new Error('missing fixture');
    const staff = await staffPage(browser, examAdmin, 390);
    for (const [name, url] of [
      ['examinations-list-mobile', '/admin/examinations'],
      ['examination-detail-mobile', shared.examinationUrl],
      ['examination-application-mobile', '/admin/examinations/application'],
    ] as const) {
      await staff.goto(url);
      await expect(staff.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(staff);
      await expectNoSeriousA11yViolations(staff);
      await capture(staff, name);
    }
    await staff.context().close();
    const portal = await studentPage(browser, alpha, 390);
    await portal.goto('/student/examinations');
    await expect(portal.getByRole('heading', { level: 1, name: 'Examinations' })).toBeVisible();
    await expectNoHorizontalOverflow(portal);
    await expectNoSeriousA11yViolations(portal);
    await capture(portal, 'student-examinations-mobile');
    await portal.context().close();
  });
});
