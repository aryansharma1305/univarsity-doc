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
  syntheticPng,
} from './support';

/**
 * Phase 9C browser tests. Runs after examinations.spec.ts (one worker, file order): the confirmed
 * INR fee rule is active and E2E Examinee Alpha has an APPROVED re-exam application. Every payment
 * detail, QR image and transaction reference here is synthetic and clearly marked as test data.
 */

const shared = { paymentUrl: '', destinationUrl: '' };

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

async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByLabel(label).click();
  await page.getByRole('option', { name: option }).click();
}

test.describe.configure({ mode: 'serial' });

test('India payment details: prepared, approved by a second person, paid by the student, verified by staff', async ({
  browser,
}) => {
  const { admin, paymentChecker, approver, examAdmin, examStudents } = fixtures();
  const [alpha, beta] = examStudents;
  if (!alpha || !beta) throw new Error('missing fixtures');

  // Before anything is configured, all eight choices are honestly "not configured".
  const maker = await staffPage(browser, admin);
  await maker
    .getByRole('complementary', { name: 'Admin navigation' })
    .getByRole('link', { name: 'Payment Settings', exact: true })
    .click();
  await expect(
    maker.getByRole('heading', { level: 1, name: 'Re-exam payment settings' }),
  ).toBeVisible();
  await expect(maker.getByText(/^Not configured/)).toHaveCount(8);
  await expectNoSeriousA11yViolations(maker);
  await capture(maker, 'payment-settings-desktop');

  // SUPER_ADMIN (maker) prepares India's details and uploads the (synthetic) QR.
  await maker.getByRole('button', { name: 'New draft' }).click();
  const dialog = maker.getByRole('dialog', { name: 'New payment details (draft)' });
  await choose(maker, 'Country / region', 'India');
  await dialog
    .getByLabel(/Beneficiary \/ payee name/)
    .fill('E2E TEST Synthetic University Fees Account');
  await choose(maker, 'Payment method', 'UPI QR');
  await dialog
    .getByLabel(/Payment instructions shown to students/)
    .fill('E2E TEST ONLY: scan this synthetic QR. It is not a real payment code.');
  await expectNoSeriousA11yViolations(maker);
  await dialog.getByRole('button', { name: 'Save draft' }).click();
  await expect(maker).toHaveURL(/\/admin\/settings\/re-exam-payments\/[0-9a-f-]{36}$/);
  shared.destinationUrl = maker.url();
  await maker.getByLabel(/QR image \(PNG or JPEG/).setInputFiles({
    name: 'e2e-qr.png',
    mimeType: 'image/png',
    buffer: await syntheticPng(maker, 320, 320),
  });
  await maker.getByRole('button', { name: 'Upload QR image' }).click();
  await expect(maker.getByRole('img', { name: /Payment QR for India/ })).toBeVisible();
  // The preparer cannot approve their own details.
  await expect(maker.getByRole('button', { name: 'Approve' })).toBeDisabled();
  await capture(maker, 'payment-destination-draft-desktop');
  await maker.context().close();

  // A second SUPER_ADMIN (checker) approves with the explicit confirmation.
  const checker = await staffPage(browser, paymentChecker);
  await checker.goto(shared.destinationUrl);
  await checker.getByRole('button', { name: 'Approve' }).click();
  const approve = checker.getByRole('dialog', { name: 'Approve these payment details?' });
  await expect(approve.getByRole('button', { name: 'Approve' })).toBeDisabled();
  await approve.getByLabel(/I confirm the university approved/).check();
  await approve.getByRole('button', { name: 'Approve' }).click();
  await expect(checker.getByText('Approved — shown to students').first()).toBeVisible();
  await expectNoSeriousA11yViolations(checker);
  await capture(checker, 'payment-destination-approved-desktop');
  await checker.context().close();

  // The student opens their existing (approved) application and pays with India's details.
  const portal = await studentPage(browser, alpha);
  await portal.goto('/student/examinations/re-exam/applications');
  await portal.getByRole('link', { name: 'Pay now' }).first().click();
  await expect(
    portal.getByRole('heading', { level: 1, name: 'Pay the re-exam fee' }),
  ).toBeVisible();
  shared.paymentUrl = portal.url();
  const main = portal.getByRole('main');
  await expect(main.getByText('E2E Examinee Alpha')).toBeVisible();
  await expect(main.getByText('Re-exam attempt 1 (first re-exam)')).toBeVisible();
  await expect(portal.getByRole('radio', { name: /^Pakistan/ })).toBeDisabled();
  await expect(portal.getByRole('img')).toHaveCount(0);
  await portal.getByRole('radio', { name: /^India/ }).check();
  await portal.getByRole('button', { name: 'Show payment details' }).click();
  await expect(
    portal.getByRole('img', { name: /University payment QR code for India/ }),
  ).toBeVisible();
  await expect(main.getByText('E2E TEST Synthetic University Fees Account')).toBeVisible();
  await expect(main.getByText('₹1,000.00').first()).toBeVisible();
  await expectNoSeriousA11yViolations(portal);
  await capture(portal, 'student-re-exam-payment-desktop');
  await portal.getByLabel(/Transaction reference/).fill('E2E-UTR-000012345678');
  await portal.getByRole('button', { name: 'Submit payment details' }).click();
  await expect(main.getByText('Submitted — awaiting verification')).toBeVisible();
  await expect(main.getByText(/It is not verified yet/)).toBeVisible();

  // Another student cannot open it.
  const other = await studentPage(browser, beta);
  await other.goto(shared.paymentUrl);
  await expect(other.getByText(/This payment page could not be loaded/)).toBeVisible();
  await expect(other.getByText('E2E-UTR-000012345678')).toHaveCount(0);
  await other.context().close();

  // The APPROVER reviews: unverified until explicitly confirmed against the university account.
  const reviewer = await staffPage(browser, approver);
  await reviewer
    .getByRole('complementary', { name: 'Admin navigation' })
    .getByRole('link', { name: 'Re-exam Payments', exact: true })
    .click();
  await reviewer
    .getByLabel(/Search by student, registration number/)
    .fill(alpha.registrationNumber);
  await reviewer.getByRole('link', { name: /^RX-/ }).first().click();
  await expect(
    reviewer.getByRole('heading', { level: 1, name: 'E2E Examinee Alpha' }),
  ).toBeVisible();
  await expect(reviewer.getByRole('note')).toContainText('does not prove the university');
  await capture(reviewer, 're-exam-payment-review-desktop');
  await reviewer.getByRole('button', { name: 'Verify payment' }).click();
  const verify = reviewer.getByRole('dialog', { name: 'Verify this payment?' });
  await verify.getByLabel('Amount received').fill('1000.00');
  await expect(verify.getByRole('button', { name: 'Verify payment' })).toBeDisabled();
  await verify.getByLabel(/I checked the university’s payment account/).check();
  await expectNoSeriousA11yViolations(reviewer);
  await verify.getByRole('button', { name: 'Verify payment' }).click();
  await expect(reviewer.getByText('Verified by the university').first()).toBeVisible();
  await reviewer.context().close();

  await portal.reload();
  await expect(portal.getByText(/The university confirmed it received your payment/)).toBeVisible();
  await portal.context().close();

  // The academic decision stays separate (approved earlier by EXAM_ADMIN, unchanged by payment).
  const decider = await staffPage(browser, examAdmin);
  await decider.goto('/admin/re-exam-applications');
  await decider
    .getByLabel('Search by student name or registration number')
    .fill(alpha.registrationNumber);
  await decider.getByRole('link', { name: /^RX-/ }).first().click();
  await expect(decider.getByText('Approved').first()).toBeVisible();
  await expect(
    decider.getByRole('heading', { name: 'Payment (separate from the decision)' }),
  ).toBeVisible();
  await expect(decider.getByText('Verified by the university')).toBeVisible();
  await decider.context().close();
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('payment screens work at 390px', async ({ browser }) => {
    const { admin, approver, examStudents } = fixtures();
    const [alpha] = examStudents;
    if (!alpha) throw new Error('missing fixture');
    for (const [account, pages] of [
      [admin, [['payment-settings-mobile', '/admin/settings/re-exam-payments']]],
      [approver, [['re-exam-payments-mobile', '/admin/re-exam-payments']]],
    ] as const) {
      const staff = await staffPage(browser, account, 390);
      for (const [name, url] of pages) {
        await staff.goto(url);
        await expect(staff.getByRole('heading', { level: 1 })).toBeVisible();
        await expectNoHorizontalOverflow(staff);
        await expectNoSeriousA11yViolations(staff);
        await capture(staff, name);
      }
      await staff.context().close();
    }
    const portal = await studentPage(browser, alpha, 390);
    await portal.goto(shared.paymentUrl);
    await expect(
      portal.getByRole('heading', { level: 1, name: 'Pay the re-exam fee' }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(portal);
    await expectNoSeriousA11yViolations(portal);
    await capture(portal, 'student-re-exam-payment-mobile');
    await portal.context().close();
  });
});
