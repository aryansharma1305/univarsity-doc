import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  capture,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  fixtures,
  signIn,
} from './support';

test('staff users: create an account, change its roles, disable and re-enable it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, fixtures().admin);
  await page.goto('/admin/settings/staff');
  await expect(page.getByRole('heading', { level: 1, name: 'Staff Users & Roles' })).toBeVisible();
  await expect(page.locator('header').getByRole('link', { name: /^Notifications/ })).toBeVisible();

  const email = `e2e.staff.${randomUUID().slice(0, 8)}@example.test`;
  await page.getByRole('button', { name: 'Add staff account' }).click();
  const create = page.getByRole('dialog', { name: 'Add staff account' });
  await create.getByLabel('Full name').fill('E2E Synthetic Staff');
  await create.getByLabel('Email').fill(email);
  await create.getByRole('checkbox', { name: /^VIEWER/ }).check();
  await create.getByLabel('Temporary password').fill('E2E temporary handover phrase 42!');
  await expectNoSeriousA11yViolations(page);
  await create.getByRole('button', { name: 'Create account' }).click();
  await expect(create).toBeHidden();

  const card = page.getByRole('listitem').filter({ hasText: email });
  await expect(card).toContainText('must set a new password');
  await card.getByRole('button', { name: 'Change roles' }).click();
  const roles = page.getByRole('dialog', { name: 'Change roles' });
  await roles.getByRole('checkbox', { name: /^APPROVER/ }).check();
  await roles.getByRole('button', { name: 'Save roles' }).click();
  await expect(card).toContainText('APPROVER, VIEWER');

  await card.getByRole('button', { name: 'Disable' }).click();
  await page
    .getByRole('dialog', { name: 'Disable account' })
    .getByRole('button', { name: 'Disable account' })
    .click();
  await expect(card).toContainText('Disabled');
  await card.getByRole('button', { name: 'Re-enable' }).click();
  const enable = page.getByRole('dialog', { name: 'Re-enable account' });
  await enable.getByLabel('Temporary password').fill('E2E second handover phrase 43!');
  await enable.getByRole('button', { name: 'Re-enable account' }).click();
  await expect(card).toContainText('Active');
  await capture(page, 'admin-staff-users-desktop');

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
});

test('staff users: other roles cannot manage staff', async ({ page }) => {
  await signIn(page, fixtures().registrar);
  const denied = await page.request.get('/api/v1/staff-users');
  expect(denied.status()).toBe(403);
});
