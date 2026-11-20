import { type Page, expect, test } from '@playwright/test';
import { fixtures, signIn, studentSignIn } from './support';

/**
 * Content-Security-Policy (src/lib/csp.ts): the enforced policy must not break any page, and the
 * strict report-only policy must already be clean, so it can be enforced later without breakage.
 * Chromium logs both kinds of violation to the console ("[Report Only] Refused to …").
 */
function collectCspViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (text.includes('Content Security Policy')) violations.push(`${page.url()}: ${text}`);
  });
  return violations;
}

async function visit(page: Page, path: string): Promise<void> {
  const response = await page.goto(path);
  expect(response?.status(), path).toBeLessThan(400);
  await page.waitForLoadState('networkidle');
}

test('pages send both CSP headers, and every inline script carries the request nonce', async ({
  request,
}) => {
  for (const path of ['/', '/help', '/status', '/admin/login', '/student/login']) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    const headers = response.headers();
    expect(headers['content-security-policy'], path).toContain("frame-ancestors 'none'");
    const reportOnly = headers['content-security-policy-report-only'] ?? '';
    const nonce = /'nonce-([^']+)'/.exec(reportOnly)?.[1];
    expect(nonce, path).toBeTruthy();
    const html = await response.text();
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length, path).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag, path).toContain(`nonce="${nonce ?? ''}"`);
  }
  // A fresh nonce per response: the homepage is no longer served from the prerender cache.
  const [a, b] = await Promise.all([request.get('/'), request.get('/')]);
  expect(a.headers()['content-security-policy-report-only']).not.toBe(
    b.headers()['content-security-policy-report-only'],
  );
});

test('public and sign-in pages load without any CSP violation', async ({ page }) => {
  const violations = collectCspViolations(page);
  for (const path of ['/', '/help', '/privacy', '/terms', '/contact', '/status', '/results']) {
    await visit(page, path);
  }
  await visit(page, '/admin/login');
  await visit(page, '/student/login');
  // The homepage hero must be visible: the MOTION_GUARD script and GSAP ran under the policy.
  await visit(page, '/');
  await expect(page.locator('body')).not.toHaveAttribute('data-dv-motion', { timeout: 5000 });
  expect(violations).toEqual([]);
});

test('signed-in staff and student pages load without any CSP violation', async ({ page }) => {
  const violations = collectCspViolations(page);
  await signIn(page, fixtures().admin);
  for (const path of ['/admin', '/admin/students', '/admin/imports', '/admin/security/mfa']) {
    await visit(page, path);
  }
  await page.context().clearCookies();
  await studentSignIn(page, fixtures().sampleStudent);
  for (const path of ['/student', '/student/profile', '/student/documents']) {
    await visit(page, path);
  }
  expect(violations).toEqual([]);
});

test('the report sink accepts a violation report', async ({ request }) => {
  const response = await request.post('/csp-report', {
    headers: { 'content-type': 'application/csp-report' },
    data: JSON.stringify({
      'csp-report': {
        'document-uri': 'http://127.0.0.1/',
        'effective-directive': 'script-src-elem',
        'blocked-uri': 'inline',
      },
    }),
  });
  expect(response.status()).toBe(204);
});

test('the enforced policy lets the Razorpay payment button reach every host it needs', async ({
  page,
}) => {
  // Stand-in for checkout.razorpay.com/v1/payment-button.js: the same requests the real script
  // makes (hosts from lib/csp.ts). The browser blocks CSP violations before Playwright's routing,
  // so a request only arrives here if the policy allowed it. Nothing reaches Razorpay.
  const stub = `fetch('https://api.razorpay.com/v1/payment_buttons/pl_e2e/button_preferences').catch(()=>{});
var s=document.createElement('script');s.src='https://cdn.razorpay.com/static/assets/color.js';document.head.appendChild(s);
var f=document.createElement('iframe');f.src='https://razorpay.com/payment-button/pl_e2e/view';document.body.appendChild(f);
new Image().src='https://cdn.razorpay.com/static/e2e.png';`;
  const reached = new Set<string>();
  await page.route(/^https:\/\/([a-z]+\.)?razorpay\.com\//, (route) => {
    const url = new URL(route.request().url());
    reached.add(`${url.host}${url.pathname}`);
    return route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*' },
      contentType: url.pathname.endsWith('.js') ? 'text/javascript' : 'text/plain',
      body: url.pathname === '/v1/payment-button.js' ? stub : '',
    });
  });
  const enforced: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (text.includes('Content Security Policy') && !text.includes('report-only'))
      enforced.push(text);
  });
  const student = fixtures().profileStudents[0];
  if (!student) throw new Error('Missing synthetic fixture');
  await studentSignIn(page, student);
  // A page that renders the payment panel (payment-buttons.spec.ts).
  await visit(page, `/student/certificate-requests/${fixtures().certificateRequestId}`);
  // Same mechanism as RazorpayTestEmbed: a script element appended at runtime.
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/payment-button.js';
    document.body.append(script);
  });
  await expect
    .poll(() => [...reached].sort())
    .toEqual([
      'api.razorpay.com/v1/payment_buttons/pl_e2e/button_preferences',
      'cdn.razorpay.com/static/assets/color.js',
      'cdn.razorpay.com/static/e2e.png',
      'checkout.razorpay.com/v1/payment-button.js',
      'razorpay.com/payment-button/pl_e2e/view',
    ]);
  expect(enforced).toEqual([]);
});
