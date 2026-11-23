import { expect, test } from '@playwright/test';
import {
  capture,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  fixtures,
  signIn,
} from './support';

test('admin dashboard and responsive navigation acceptance', async ({ page }) => {
  test.setTimeout(120_000);
  const prefix = process.env.UI02_BASELINE === '1' ? 'ui02-before' : 'ui02';
  await signIn(page, fixtures().admin);
  for (const [width, height, name] of [
    [1440, 1000, 'desktop'],
    [768, 1024, 'tablet'],
    [390, 844, 'mobile'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const tabs = page.getByRole('tablist', { name: 'Workspace categories' });
    await expect(tabs.getByRole('tab', { name: 'Settings & Administration' })).toBeVisible();
    const listBox = await tabs.boundingBox();
    const lastTab = await tabs
      .getByRole('tab', { name: 'Settings & Administration' })
      .boundingBox();
    if (!listBox || !lastTab) throw new Error('Workspace tabs should be visible');
    expect(lastTab.y + lastTab.height).toBeLessThanOrEqual(listBox.y + listBox.height);
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page);
    await page.mouse.move(0, 0);
    await capture(page, `${prefix}-dashboard-${name}`);
    if (width === 1440) {
      await page.getByRole('button', { name: 'Collapse sidebar' }).click();
      await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
      await capture(page, `${prefix}-collapsed-desktop`);
      await page.getByRole('button', { name: 'Expand sidebar' }).click();
    } else {
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible();
      await expectNoSeriousA11yViolations(page);
      await page.screenshot({ path: `test-results/screenshots/${prefix}-drawer-${name}.png` });
      await page
        .getByRole('dialog', { name: 'Navigation' })
        .getByRole('link', { name: 'Payment Settings', exact: true })
        .scrollIntoViewIfNeeded();
      await expect(
        page
          .getByRole('dialog', { name: 'Navigation' })
          .getByRole('link', { name: 'Payment Settings', exact: true }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeHidden();
      await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();
    }
  }
  await page.goto('/admin/students');
  await capture(page, `${prefix}-students-mobile`);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await capture(page, `${prefix}-students-desktop`);
});

test('workspace keyboard, role visibility and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page, fixtures().viewer);
  await expect(page.getByRole('heading', { name: 'Pending work' })).toHaveCount(0);
  const academic = page.getByRole('tab', { name: 'Subject Management', exact: true });
  await academic.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Examination', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    page.getByRole('tabpanel').getByRole('link', { name: 'Draft Results', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Payment Settings', exact: true })).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
  await capture(page, 'ui02-viewer-reduced-motion');
});

test('workspace shortcuts open the selected policy and document type', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, fixtures().admin);

  const sidebar = page.getByRole('navigation', { name: 'Sections', exact: true });
  await sidebar.getByRole('link', { name: 'Admission Letter Verification', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Policies', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByLabel('Verification service', { exact: true })).toHaveValue(
    'admission-letter',
  );

  const transcript = sidebar.getByRole('link', { name: 'Transcript', exact: true });
  await transcript.click();
  await expect(transcript).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('tab', { name: 'Documents', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText('Showing transcript records.', { exact: false })).toBeVisible();
});

test('dashboard loading and empty states remain honest', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, fixtures().admin);
  let release: (() => void) | undefined;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/dashboard**', async (route) => {
    await wait;
    await route.fulfill({
      json: {
        counts: { students: 0, activeRegistrations: 0, programs: 0, academicSessions: 0 },
        recentActivity: [],
        workload: {
          profileRequestsPending: 0,
          certificateRequestsAwaitingStaff: 0,
          reExamApplicationsPending: 0,
          reExamPaymentsPending: 0,
          resultsDraft: 0,
          resultsUnderReview: 0,
          resultsPublished: 0,
          resultsWithheld: 0,
          documentsAwaitingApproval: 0,
          documentsIssued: 0,
          admissionLettersIssued: 0,
          messagesAwaitingReply: 0,
          verificationQueriesOpen: 0,
          unreadNotifications: 0,
        },
        enrolment: { academicSessionId: null, byProgram: [], bySession: [] },
      },
    });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('region', { name: 'Totals' })).toHaveAttribute('aria-busy', 'true');
  await page.screenshot({
    path: 'test-results/screenshots/ui02-loading-desktop.png',
    fullPage: true,
  });
  release?.();
  await expect(page.getByRole('region', { name: 'Totals' })).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByText('No activity yet')).toBeVisible();
  await capture(page, 'ui02-empty-desktop');
});
