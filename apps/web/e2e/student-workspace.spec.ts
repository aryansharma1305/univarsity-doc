import { expect, test } from '@playwright/test';
import {
  capture,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  fixtures,
  studentSignIn,
} from './support';

test('student workspace visual acceptance and accessible navigation', async ({ page }) => {
  test.setTimeout(120_000);
  const student = fixtures().profileStudents[0];
  if (!student) throw new Error('Missing synthetic student');
  const prefix = process.env.UI03_BASELINE === '1' ? 'ui03-before' : 'ui03';
  await studentSignIn(page, student);
  for (const [width, height, name] of [
    [390, 844, 'mobile'],
    [768, 1024, 'tablet'],
    [1440, 1000, 'desktop'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(student.studentName);
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page);
    await capture(page, `${prefix}-dashboard-${name}`);
    if (prefix === 'ui03')
      await page.screenshot({
        path: `test-results/screenshots/${prefix}-dashboard-${name}-viewport.png`,
      });
    if (width < 1024) {
      const trigger = page.getByRole('button', { name: 'Open student navigation' });
      await trigger.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expectNoSeriousA11yViolations(page);
      await page.screenshot({ path: `test-results/screenshots/${prefix}-navigation-${name}.png` });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(trigger).toBeFocused();
    }
  }
  for (const [route, name] of [
    ['/student/profile', 'profile'],
    ['/student/profile/requests', 'profile-requests'],
    ['/student/profile/update', 'profile-update'],
    ['/student/requests', 'requests'],
    ['/student/examinations/apply', 'exam-apply'],
    ['/student/certificate-requests', 'certificate-request'],
    ['/student/certificate-requests/samples', 'certificate-samples'],
    ['/student/examinations', 'examinations'],
    ['/student/documents', 'documents'],
    ['/student/examinations/re-exam/applications', 'applications'],
    ['/student/examinations/re-exam', 're-exam'],
    ['/student/settings', 'settings'],
  ]) {
    await page.goto(route ?? '/student');
    for (const [width, height, size] of [
      [390, 844, 'mobile'],
      [1440, 1000, 'desktop'],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expectNoHorizontalOverflow(page);
      await expectNoSeriousA11yViolations(page);
      await capture(page, `${prefix}-${name}-${size}`);
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/student');
  await expect(page.getByRole('navigation', { name: 'Quick actions' })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await capture(page, `${prefix}-reduced-motion`);
});

test('mobile student tasks remain accessible with motion disabled and show only owned data', async ({
  page,
}) => {
  test.skip(process.env.UI03_BASELINE === '1', 'New navigation acceptance applies to UI-03.');
  const [other, student] = fixtures().profileStudents;
  if (!student || !other) throw new Error('Missing synthetic students');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await studentSignIn(page, student);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(student.studentName);
  await expect(page.locator('main')).not.toContainText(other.studentName);
  await expect(page.locator('main')).not.toContainText(other.registrationNumber);
  // The simplified dashboard has no documents card or activity feed, so no other data can leak in.
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Recent activity' })).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText(/CGPA|SGPA|Attendance/);
  const navigation = page.getByRole('navigation', { name: 'Student quick navigation' });
  await navigation.getByRole('link', { name: 'Home', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(navigation.getByRole('link', { name: 'Profile', exact: true })).toBeFocused();
  for (const [label, path] of [
    ['Profile', 'profile'],
    ['Exams', 'examinations'],
    ['Documents', 'documents'],
    ['Home', ''],
  ] as const) {
    await navigation.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/student${path ? '/' + path : ''}$`));
    await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
    await expectNoHorizontalOverflow(page);
  }
  await page.setViewportSize({ width: 320, height: 740 });
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);
  expect(errors).toEqual([]);
});
