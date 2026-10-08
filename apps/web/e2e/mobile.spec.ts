import { expect, test } from '@playwright/test';
import { capture, expectNoHorizontalOverflow, fixtures, signIn } from './support';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('admin shell works at 390px: drawer navigation, student list cards and detail', async ({
  page,
}) => {
  const { admin, fixture } = fixtures();
  await signIn(page, admin);
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, 'admin-dashboard-mobile');

  await page.getByRole('button', { name: 'Open navigation' }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('link', { name: 'Students' })).toBeVisible();
  await drawer.getByRole('link', { name: 'Students' }).click();
  await expect(drawer).toBeHidden();

  await expect(page.getByRole('heading', { level: 1, name: 'Students' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: fixture.studentName, exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, 'student-list-mobile');

  await page
    .getByRole('link', { name: fixture.studentName, exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: fixture.studentName })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, 'student-detail-mobile');

  await page.goto('/admin/students/new');
  await expect(page.getByRole('heading', { name: 'New student' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, 'student-create-mobile');
});
