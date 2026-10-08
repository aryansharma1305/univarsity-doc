import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { type Page, expect } from '@playwright/test';

export interface Account {
  email: string;
  password: string;
  displayName: string;
}

export interface E2EFixtures {
  admin: Account;
  viewer: Account;
  registrar: Account;
  fixture: {
    studentId: string;
    studentName: string;
    registrationNumber: string;
    programCode: string;
    sessionCode: string;
  };
}

/** Written by prepare-e2e.mjs: random credentials + fixture IDs for the disposable e2e database. */
export function fixtures(): E2EFixtures {
  const file = fileURLToPath(new URL('../.e2e/credentials.json', import.meta.url));
  return JSON.parse(readFileSync(file, 'utf8')) as E2EFixtures;
}

export async function signIn(page: Page, account: Account): Promise<void> {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

export function uniqueCode(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

/** Runs axe and fails on serious/critical WCAG A/AA violations. */
export async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(
    serious.map(
      (v) =>
        `${v.id}: ${v.help} (${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(', ')})`,
    ),
  ).toEqual([]);
}

/** Saves a full-page screenshot for manual visual review (not a pixel-diff assertion). */
export async function capture(page: Page, name: string): Promise<void> {
  // Wait for content, not "network idle" (Next.js keeps prefetching links in the background).
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  // Full-page captures of sticky layouts are only faithful from the top of the page.
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  // Let entrance animations finish so the screenshot shows the settled page.
  await page.waitForTimeout(150);
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
  await page.waitForTimeout(400);
  await page.screenshot({ path: `test-results/screenshots/${name}.png`, fullPage: true });
}

/** No page-level horizontal scrolling (layout chrome must fit the viewport). */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

/** Clicks an admin section in the desktop sidebar (exact name, scoped to the sidebar). */
export async function openSection(page: Page, name: string): Promise<void> {
  await page
    .getByRole('complementary', { name: 'Admin navigation' })
    .getByRole('link', { name, exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}
