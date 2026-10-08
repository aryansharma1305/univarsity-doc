import { expect, test } from '@playwright/test';
import { fixtures, openSection, signIn } from './support';

test('VIEWER can read students but sees no create/edit actions', async ({ page }) => {
  const { viewer, fixture } = fixtures();
  await signIn(page, viewer);

  // Dashboard shows counts, but no audit activity (no audit.read)
  await expect(page.getByText('Total students')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent activity' })).toHaveCount(0);

  await openSection(page, 'Students');
  await expect(
    page.getByRole('link', { name: fixture.studentName, exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add student' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Edit / })).toHaveCount(0);

  await page
    .getByRole('link', { name: fixture.studentName, exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: fixture.studentName })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  await page.getByRole('tab', { name: /Registrations/ }).click();
  await expect(page.getByRole('button', { name: 'Add registration' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Edit registration/ })).toHaveCount(0);

  for (const [link, button] of [
    ['Departments', 'Add department'],
    ['Course Management', 'Create course'],
    ['Subject Catalogue', 'Add subject'],
    ['Academic Sessions', 'Add session'],
  ] as const) {
    await openSection(page, link);
    await expect(page.getByRole('button', { name: button })).toHaveCount(0);
  }

  // Direct navigation to the create page shows an explicit permission state, not a form.
  await page.goto('/admin/students/new');
  await expect(page.getByText('You don’t have access to this')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create student' })).toHaveCount(0);
});
