import { expect, test } from '@playwright/test';
import {
  capture,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  fixtures,
  studentSignIn,
} from './support';

test('fee panels remain non-transactional, hard-copy-only and accessible at all viewports', async ({
  page,
}) => {
  const student = fixtures().profileStudents[0];
  if (!student) throw new Error('Missing synthetic fixture');
  const providerRequests: string[] = [];
  await page.route('https://checkout.razorpay.com/**', (route) => {
    providerRequests.push(route.request().url());
    return route.abort();
  });
  await studentSignIn(page, student);
  await page.goto(`/student/certificate-requests/${fixtures().certificateRequestId}`);
  for (const [width, height] of [
    [1440, 1000],
    [768, 1024],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(
      page.getByRole('heading', { name: 'Pay for Hard Copy Certificate' }),
    ).toBeVisible();
    await expect(page.getByText('Payment status: Unavailable')).toBeVisible();
    await expect(page.getByText(/The certificate fee applies only to hard copies/)).toBeVisible();
    await expect(page.locator('script[src*="checkout.razorpay.com"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Pay.*Certificate/ })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page);
    await capture(page, `razorpay-certificate-${width}`);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('link', { name: 'Back to certificate requests' }).focus();
  await expect(page.getByRole('link', { name: 'Back to certificate requests' })).toBeFocused();
  await page.reload();
  await expect(page.getByText('Payment status: Unavailable')).toBeVisible();
  expect(providerRequests).toEqual([]);
});
