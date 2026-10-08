import { expect, test } from '@playwright/test';
import {
  capture,
  expectNoHorizontalOverflow,
  fixtures,
  openSection,
  signIn,
  uniqueCode,
} from './support';

test.describe.configure({ mode: 'serial' });

test('SUPER_ADMIN creates a department, program, session and student, then finds and opens the student', async ({
  page,
}) => {
  const { admin } = fixtures();
  const department = uniqueCode('DEPT');
  const program = uniqueCode('PROG');
  const session = uniqueCode('SES');
  const registration = uniqueCode('REG');
  const studentName = `Playwright Student ${registration}`;

  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, admin);
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
  await expect(page.getByText('Total students')).toBeVisible();
  await capture(page, 'admin-dashboard-desktop');

  // Department
  await openSection(page, 'Departments');
  await page.getByRole('button', { name: 'Add department' }).first().click();
  const departmentDialog = page.getByRole('dialog');
  await departmentDialog.getByLabel('Code').fill(department);
  await departmentDialog.getByLabel('Name').fill('Playwright Department');
  await departmentDialog.getByRole('button', { name: 'Add department' }).click();
  await expect(page.getByText(`Department ${department} created`)).toBeVisible();
  await expect(page.getByRole('cell', { name: department, exact: true })).toBeVisible();

  // Duplicate code shows a field-level conflict
  await page.getByRole('button', { name: 'Add department' }).first().click();
  await departmentDialog.getByLabel('Code').fill(department);
  await departmentDialog.getByLabel('Name').fill('Duplicate');
  await departmentDialog.getByRole('button', { name: 'Add department' }).click();
  await expect(
    departmentDialog.getByText('A department with this code already exists.'),
  ).toBeVisible();
  await departmentDialog.getByRole('button', { name: 'Cancel' }).click();

  // Course (program) in that department
  await openSection(page, 'Course Management');
  await page.getByRole('button', { name: 'Create course' }).first().click();
  const programDialog = page.getByRole('dialog');
  await programDialog.getByLabel('Course code').fill(program);
  await programDialog.getByLabel('Course name').fill('Playwright Program');
  await programDialog.getByLabel('Academic structure').click();
  await page.getByRole('option', { name: 'Semester-wise' }).click();
  await programDialog.getByLabel('Number of semesters').fill('6');
  await programDialog.getByLabel('Department / school').click();
  await page.getByRole('option', { name: new RegExp(department) }).click();
  await programDialog.getByRole('button', { name: 'Create course' }).click();
  await expect(page.getByText(`Course ${program} created`)).toBeVisible();

  // Academic session
  await openSection(page, 'Academic Sessions');
  await page.getByRole('button', { name: 'Add session' }).first().click();
  const sessionDialog = page.getByRole('dialog');
  await sessionDialog.getByLabel('Code').fill(session);
  await sessionDialog.getByLabel('Name').fill('Playwright Session');
  await sessionDialog.getByLabel('Starts on').fill('2026-07-01');
  await sessionDialog.getByLabel('Ends on').fill('2026-06-01');
  await sessionDialog.getByRole('button', { name: 'Add session' }).click();
  await expect(
    sessionDialog.getByText('The end date must be on or after the start date.'),
  ).toBeVisible();
  await sessionDialog.getByLabel('Ends on').fill('2027-06-30');
  await sessionDialog.getByRole('button', { name: 'Add session' }).click();
  await expect(page.getByText(`Session ${session} created`)).toBeVisible();

  // Student + registration
  await openSection(page, 'Students');
  await page.getByRole('main').getByRole('link', { name: 'Add student' }).first().click();
  await expect(page.getByRole('heading', { name: 'New student' })).toBeVisible();
  await page.getByRole('button', { name: 'Create student' }).click();
  await expect(page.getByText('Enter the full name.')).toBeVisible(); // client-side validation
  await capture(page, 'student-create-desktop');

  await page.getByLabel('Full name').fill(studentName);
  await page.getByLabel('Date of birth').fill('2005-04-12');
  await page.getByLabel('Registration number').fill(registration);
  await page.getByLabel('Program').click();
  await page.getByRole('option', { name: new RegExp(program) }).click();
  await expect(page.getByText(`Set by the program (${department}).`)).toBeVisible();
  await page.getByLabel('Academic session').click();
  await page.getByRole('option', { name: new RegExp(session) }).click();
  await page.getByRole('button', { name: 'Create student' }).click();

  await expect(page.getByRole('heading', { level: 1, name: studentName })).toBeVisible();
  await expect(page.getByText(registration).first()).toBeVisible();
  await capture(page, 'student-detail-desktop');

  await page.getByRole('tab', { name: 'Activity' }).click();
  await expect(page.getByText('Student record created')).toBeVisible();
  await expect(page.getByText(`Registration ${registration} created`)).toBeVisible();

  // Back in the list, searchable by registration number
  await openSection(page, 'Students');
  await page.getByRole('searchbox', { name: 'Search students' }).fill(registration.toLowerCase());
  await expect(
    page.getByRole('link', { name: studentName, exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, 'student-list-desktop');
  await page
    .getByRole('link', { name: studentName, exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: studentName })).toBeVisible();
});

test('SUPER_ADMIN changes a registration status from the detail page', async ({ page }) => {
  const { admin, fixture } = fixtures();
  await signIn(page, admin);
  await page.goto(`/admin/students/${fixture.studentId}`);
  await page.getByRole('tab', { name: /Registrations/ }).click();
  await page
    .getByRole('button', { name: `Edit registration ${fixture.registrationNumber}` })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Status').click();
  await page.getByRole('option', { name: 'Suspended' }).click();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(`Registration ${fixture.registrationNumber} updated`)).toBeVisible();
  await page.getByRole('tab', { name: 'Activity' }).click();
  await expect(page.getByText(/status changed from active to suspended/)).toBeVisible();
  // Restore for other tests
  await page.getByRole('tab', { name: /Registrations/ }).click();
  await page
    .getByRole('button', { name: `Edit registration ${fixture.registrationNumber}` })
    .click();
  await dialog.getByLabel('Status').click();
  await page.getByRole('option', { name: 'Active' }).click();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toBeHidden();
});
