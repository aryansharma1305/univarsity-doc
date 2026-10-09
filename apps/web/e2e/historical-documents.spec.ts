import { type Browser, type Page, expect, test } from '@playwright/test';
import {
  type Account,
  type StudentAccount,
  capture,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  fixtures,
  openSection,
  signIn,
  studentSignIn,
  syntheticPng,
} from './support';

/** Synthetic one-page PDFs generated in the test — never real certificates. */
function pdf(marker: string, extra = ''): Buffer {
  return Buffer.from(
    [
      '%PDF-1.4',
      `% ${marker}`,
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >> endobj',
      extra,
      'trailer << /Root 1 0 R >>',
      '%%EOF',
      '',
    ].join('\n'),
    'latin1',
  );
}

const shared = { documentUrl: '', documentId: '' };

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

async function choose(page: Page, label: string, option: string) {
  await page.getByLabel(label).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** Upload through the admin form for the given registration number. */
async function uploadDocument(
  page: Page,
  input: {
    registrationNumber: string;
    title: string;
    type: string;
    file: { name: string; mimeType: string; buffer: Buffer };
  },
) {
  await page.goto('/admin/historical-documents/new');
  await page.getByRole('textbox', { name: /Student registration/ }).fill(input.registrationNumber);
  await page
    .getByRole('list', { name: 'Matching registrations' })
    .getByRole('button', { name: new RegExp(input.registrationNumber) })
    .click();
  await choose(page, 'Document type', input.type);
  await page.getByRole('textbox', { name: /^Title/ }).fill(input.title);
  await page.getByLabel(/^File/).setInputFiles(input.file);
}

test.describe.configure({ mode: 'serial' });

test('staff upload, publish, replace and withdraw; the student sees only their published documents', async ({
  browser,
}) => {
  const { registrar, admin, profileStudents } = fixtures();
  const [other, student] = profileStudents;
  if (!student || !other) throw new Error('missing fixtures');
  const staff = await staffPage(browser, registrar);
  const errors: string[] = [];
  staff.on('pageerror', (error) => errors.push(error.message));

  // Upload a historical degree certificate (PDF) with legacy provenance → draft.
  await openSection(staff, 'Historical Certificates');
  await expectNoSeriousA11yViolations(staff);
  await uploadDocument(staff, {
    registrationNumber: student.registrationNumber,
    title: 'E2E Bachelor degree certificate',
    type: 'Degree certificate',
    file: { name: 'degree.pdf', mimeType: 'application/pdf', buffer: pdf('E2E-DEGREE') },
  });
  await staff.getByRole('textbox', { name: /Certificate number/ }).fill('LEG/2019/00042');
  await staff.getByLabel(/^Issue date/).fill('2019-07-15');
  await choose(staff, 'Source', 'Legacy WordPress system');
  await staff.getByRole('textbox', { name: /Legacy record ID/ }).fill('wp-post-12345');
  await staff
    .getByRole('textbox', { name: /Printed verification URL/ })
    .fill('https://verify.example.test/certificate?id=E2E42');
  await expectNoSeriousA11yViolations(staff);
  await capture(staff, 'historical-upload-desktop');
  await staff.getByRole('button', { name: 'Upload as draft' }).click();
  await expect(staff).toHaveURL(/\/admin\/historical-documents\/[0-9a-f-]{36}$/);
  await expect(
    staff.getByRole('heading', { level: 1, name: 'E2E Bachelor degree certificate' }),
  ).toBeVisible();
  await expect(staff.getByText('Draft (not visible)').first()).toBeVisible();
  await expect(staff.getByText('https://verify.example.test/certificate?id=E2E42')).toBeVisible();
  shared.documentUrl = staff.url();
  shared.documentId = staff.url().split('/').at(-1) ?? '';
  // The uploader cannot review authenticity (maker–checker).
  await expect(staff.getByRole('button', { name: 'Review authenticity' })).toBeDisabled();
  await expectNoSeriousA11yViolations(staff);
  await capture(staff, 'historical-detail-draft-desktop');

  // The student sees nothing until it is published.
  const portal = await studentPage(browser, student);
  await portal.goto('/student/documents');
  await expect(portal.getByText('No documents published yet')).toBeVisible();
  expect(
    (await portal.request.get(`/api/v1/student/documents/${shared.documentId}/file`)).status(),
  ).toBe(404);

  // Publish (explicit, confirmed).
  await staff.getByRole('button', { name: 'Publish to student' }).click();
  const publish = staff.getByRole('dialog', { name: 'Publish to the student?' });
  await expect(publish).toContainText('does not confirm authenticity');
  await capture(staff, 'historical-publish-confirm-desktop');
  await publish.getByRole('button', { name: 'Publish document' }).click();
  await expect(staff.getByText('Published to student').first()).toBeVisible();

  await portal.reload();
  const card = portal.getByRole('article', {
    name: 'E2E Bachelor degree certificate',
    exact: true,
  });
  await expect(card).toContainText('LEG/2019/00042');
  await expect(card).toContainText('Not independently verified');
  await expect(portal.locator('main input, main form')).toHaveCount(0);
  await expect(portal.getByRole('button', { name: /upload|delete|replace|edit/i })).toHaveCount(0);
  const download = await portal.request.get(`/api/v1/student/documents/${shared.documentId}/file`);
  expect(download.status()).toBe(200);
  expect(download.headers()['content-type']).toBe('application/pdf');
  expect(download.headers()['cache-control']).toBe('private, no-store');
  expect((await download.body()).subarray(0, 5).toString()).toBe('%PDF-');
  await expectNoSeriousA11yViolations(portal);
  await capture(portal, 'student-documents-desktop');

  // Another student can neither list nor fetch it.
  const intruder = await studentPage(browser, other);
  await intruder.goto('/student/documents');
  await expect(
    intruder.getByRole('article', { name: 'E2E Bachelor degree certificate', exact: true }),
  ).toHaveCount(0);
  expect(
    (await intruder.request.get(`/api/v1/student/documents/${shared.documentId}/file`)).status(),
  ).toBe(404);
  await intruder.context().close();

  // Another authorised reviewer records the authenticity check.
  const reviewer = await staffPage(browser, admin);
  await reviewer.goto(shared.documentUrl);
  await reviewer.getByRole('button', { name: 'Review authenticity' }).click();
  const review = reviewer.getByRole('dialog', { name: 'Record authenticity review' });
  await review.getByLabel('What was checked').fill('Matched the synthetic 2019 register, page 14.');
  await review.getByRole('button', { name: 'Record review' }).click();
  await expect(reviewer.getByText('Confirmed against university records').first()).toBeVisible();
  await reviewer.context().close();
  await portal.reload();
  await expect(
    portal.getByRole('article', { name: 'E2E Bachelor degree certificate', exact: true }),
  ).toContainText('Confirmed against university records');

  // Replace with a corrected scan: the original is kept and superseded only once the replacement is published.
  await staff.reload();
  await staff.getByRole('button', { name: 'Replace' }).click();
  const replace = staff.getByRole('dialog', { name: 'Upload a replacement' });
  await replace.getByLabel('Corrected file').setInputFiles({
    name: 'degree-corrected.pdf',
    mimeType: 'application/pdf',
    buffer: pdf('E2E-DEGREE-CORRECTED'),
  });
  await replace.getByLabel('Title').fill('E2E Bachelor degree certificate (corrected)');
  await replace.getByRole('button', { name: 'Upload replacement' }).click();
  await expect(
    staff.getByRole('heading', { level: 1, name: 'E2E Bachelor degree certificate (corrected)' }),
  ).toBeVisible();
  await expect(staff.getByText(/^Replaces/)).toBeVisible();
  await staff.getByRole('button', { name: 'Publish to student' }).click();
  await staff
    .getByRole('dialog', { name: 'Publish to the student?' })
    .getByRole('button', { name: 'Publish document' })
    .click();
  await expect(staff.getByText('Published to student').first()).toBeVisible();
  await portal.reload();
  await expect(
    portal.getByRole('article', { name: 'E2E Bachelor degree certificate (corrected)' }),
  ).toBeVisible();
  await expect(
    portal.getByRole('article', { name: 'E2E Bachelor degree certificate', exact: true }),
  ).toHaveCount(0);
  await staff.goto(shared.documentUrl);
  await expect(staff.getByText('Superseded').first()).toBeVisible();
  await expect(staff.getByRole('button', { name: /Publish|Withdraw|Replace/ })).toHaveCount(0);
  await capture(staff, 'historical-detail-superseded-desktop');

  // A PNG marksheet, published then withdrawn with a reason.
  await uploadDocument(staff, {
    registrationNumber: student.registrationNumber,
    title: 'E2E Semester 1 marksheet',
    type: 'Marksheet',
    file: {
      name: 'marksheet.png',
      mimeType: 'image/png',
      buffer: await syntheticPng(staff, 600, 800),
    },
  });
  await staff.getByRole('button', { name: 'Upload as draft' }).click();
  await expect(staff.getByRole('img', { name: 'Scan: E2E Semester 1 marksheet' })).toBeVisible();
  await staff.getByRole('button', { name: 'Publish to student' }).click();
  await staff
    .getByRole('dialog', { name: 'Publish to the student?' })
    .getByRole('button', { name: 'Publish document' })
    .click();
  await expect(staff.getByText('Published to student').first()).toBeVisible();
  await staff.getByRole('button', { name: 'Withdraw' }).click();
  const withdraw = staff.getByRole('dialog', { name: 'Withdraw this document' });
  await expect(withdraw.getByRole('button', { name: 'Withdraw document' })).toBeDisabled();
  await withdraw.getByLabel(/Reason/).fill('Uploaded before the marks were corrected.');
  await withdraw.getByRole('button', { name: 'Withdraw document' }).click();
  await expect(withdraw).toBeHidden();
  await expect(staff.getByText('Withdrawn', { exact: true }).first()).toBeVisible();
  await expect(staff.getByText('Uploaded before the marks were corrected.')).toBeVisible();
  await portal.reload();
  await expect(
    portal.getByRole('article', { name: 'E2E Semester 1 marksheet', exact: true }),
  ).toHaveCount(0);

  // The register lists everything, including history that is never deleted.
  await openSection(staff, 'Historical Certificates');
  await staff.getByLabel('Search documents').fill(student.registrationNumber);
  await expect(staff).toHaveURL(/search=/);
  await expect(staff.getByRole('row')).toHaveCount(4);
  await expectNoSeriousA11yViolations(staff);
  await capture(staff, 'historical-list-desktop');
  expect(errors).toEqual([]);
  await portal.context().close();
  await staff.context().close();
});

test('unsafe uploads are refused, and read-only staff and students cannot manage documents', async ({
  browser,
}) => {
  const { registrar, viewer, profileStudents } = fixtures();
  const student = profileStudents[1];
  if (!student) throw new Error('missing fixture');
  const staff = await staffPage(browser, registrar);
  await uploadDocument(staff, {
    registrationNumber: student.registrationNumber,
    title: 'E2E Scripted PDF',
    type: 'Other document',
    file: {
      name: 'scripted.pdf',
      mimeType: 'application/pdf',
      buffer: pdf('E2E-SCRIPT', '5 0 obj << /S /JavaScript /JS (app.alert(1)) >> endobj'),
    },
  });
  await staff.getByRole('button', { name: 'Upload as draft' }).click();
  await expect(staff.getByText(/contains active content/).first()).toBeVisible();
  await expect(staff).toHaveURL(/\/admin\/historical-documents\/new$/);
  await staff.context().close();

  const reader = await staffPage(browser, viewer);
  await expect(
    reader
      .getByRole('complementary', { name: 'Admin navigation' })
      .getByRole('link', { name: 'Historical Certificates' }),
  ).toHaveCount(0);
  const { csrfToken } = (await (await reader.request.get('/api/v1/auth/csrf')).json()) as {
    csrfToken: string;
  };
  expect((await reader.request.get('/api/v1/historical-documents')).status()).toBe(403);
  expect(
    (
      await reader.request.post(`/api/v1/historical-documents/${shared.documentId}/withdraw`, {
        headers: { 'X-CSRF-Token': csrfToken },
        data: { reason: 'Not allowed for a viewer.' },
      })
    ).status(),
  ).toBe(403);
  await reader.context().close();

  const portal = await studentPage(browser, student);
  expect((await portal.request.get('/api/v1/historical-documents')).status()).toBe(401);
  await portal.goto('/admin/historical-documents');
  await expect(portal).toHaveURL(/\/admin\/login/);
  await portal.context().close();
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('document screens work at 390px', async ({ browser }) => {
    const { registrar, profileStudents } = fixtures();
    const student = profileStudents[1];
    if (!student) throw new Error('missing fixture');
    const staff = await staffPage(browser, registrar, 390);
    for (const [name, url] of [
      ['historical-list-mobile', '/admin/historical-documents'],
      ['historical-upload-mobile', '/admin/historical-documents/new'],
      ['historical-detail-mobile', shared.documentUrl],
    ] as const) {
      await staff.goto(url);
      await expect(staff.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(staff);
      await expectNoSeriousA11yViolations(staff);
      await capture(staff, name);
    }
    await staff.context().close();
    const portal = await studentPage(browser, student, 390);
    await portal.goto('/student/documents');
    await expect(portal.getByRole('article').first()).toBeVisible();
    await expectNoHorizontalOverflow(portal);
    await expectNoSeriousA11yViolations(portal);
    await capture(portal, 'student-documents-mobile');
    await portal.context().close();
  });
});
