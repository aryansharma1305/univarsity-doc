import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { expectNoSeriousA11yViolations, fixtures } from './support';

/** Independent RFC 6238 (SHA-1, 6 digits, 30 s) implementation for the test — not the app's code. */
function totp(base32Secret: string, stepOffset = 0): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of base32Secret.replace(/\s+/g, '')) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + stepOffset));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

const NEW_PASSWORD = 'e2e chosen staff passphrase 2027';

test('CLI-created staff: forced password change → MFA enrollment → sign-in with TOTP', async ({
  page,
}) => {
  const { staffMfa } = fixtures();

  // 1. First sign-in with the operator-issued password lands on the forced password change.
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(staffMfa.email);
  await page.getByLabel('Password').fill(staffMfa.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin\/security\/password$/);
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // The workspace stays closed: the server refuses it and the layout sends the user back.
  await page.goto('/admin/students');
  await expect(page).toHaveURL(/\/admin\/security\/password$/);
  const blocked = await page.request.get('/api/v1/students');
  expect(blocked.status()).toBe(403);
  expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe(
    'PASSWORD_CHANGE_REQUIRED',
  );

  await page.getByLabel('Current password').fill(staffMfa.password);
  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Confirm new password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  expect((await page.request.get('/api/v1/students')).status()).toBe(200);

  // 2. Enroll an authenticator from the account menu.
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Set up two-step verification' }).click();
  await expect(page).toHaveURL(/\/admin\/security\/mfa$/);
  await page.getByRole('button', { name: 'Set up authenticator app' }).click();
  await expect(page.getByRole('img', { name: 'QR code for your authenticator app' })).toBeVisible();
  const secret = (await page.getByTestId('mfa-secret').innerText()).replace(/\s+/g, '');
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  await expectNoSeriousA11yViolations(page);
  await page.getByLabel('Authenticator code').fill(totp(secret));
  await page.getByRole('button', { name: 'Confirm and turn on' }).click();
  await expect(page.getByRole('status')).toHaveText('Two-step verification is on.');
  await expect(page.getByTestId('recovery-codes').getByRole('listitem')).toHaveCount(10);
  await page.getByRole('button', { name: 'I have saved my recovery codes' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  // 3. Sign out, sign in again: password, then the authenticator code.
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.getByLabel('Email').fill(staffMfa.email);
  await page.getByLabel('Password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin\/login\/verify$/);
  await expect(page.getByRole('heading', { name: 'Two-step verification' })).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // A pending sign-in reaches nothing else.
  const pending = await page.request.get('/api/v1/students');
  expect(pending.status()).toBe(403);
  expect(((await pending.json()) as { error: { code: string } }).error.code).toBe('MFA_REQUIRED');

  // A wrong code is refused; the next-step code (the enrollment used the current step) works.
  await page.getByLabel('Authenticator code').fill('000000');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.locator('form').getByRole('alert')).toContainText('not valid');
  await page.getByLabel('Authenticator code').fill(totp(secret, 1));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('button', { name: /Account menu/ }).click();
  await expect(page.getByTestId('account-roles')).toHaveText('REGISTRAR');
  await expect(page.getByRole('menuitem', { name: 'Two-step verification: on' })).toBeVisible();
});
