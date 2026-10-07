import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

interface Credentials {
  email: string;
  password: string;
  displayName: string;
}

function credentials(): Credentials {
  const file = fileURLToPath(new URL('../.e2e/credentials.json', import.meta.url));
  return JSON.parse(readFileSync(file, 'utf8')) as Credentials;
}

test('unauthenticated /admin redirects to the login page', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole('heading', { name: 'DOCVERSITY' })).toBeVisible();
  await expect(page.getByText('Staff sign in')).toBeVisible();
});

test('wrong credentials show the generic error and stay on the login page', async ({ page }) => {
  const admin = credentials();
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(admin.email);
  await page.getByLabel('Password').fill('definitely the wrong password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('form').getByRole('alert')).toHaveText(
    'Unable to sign in with those credentials.',
  );
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test('a staff member can sign in, reach /admin, and sign out', async ({ page, context }) => {
  const admin = credentials();
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(admin.email);
  await page.getByLabel('Password').fill(admin.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByTestId('account-email')).toHaveText(admin.email);
  await expect(page.getByTestId('account-roles')).toHaveText('SUPER_ADMIN');

  // The session cookie is HttpOnly: client JavaScript cannot read it.
  const cookies = await context.cookies();
  const session = cookies.find((cookie) => cookie.name === 'dv_session');
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe('Lax');
  expect(await page.evaluate(() => document.cookie)).not.toContain('dv_session');

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login$/);
});
