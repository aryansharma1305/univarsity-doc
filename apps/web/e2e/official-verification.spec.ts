import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  capture,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  fixtures,
  studentSignIn,
} from './support';
interface WorkflowResponse {
  id: string;
  resultId: string;
  registrations: { id: string }[];
  issued: { code: string }[];
  verificationUrl: string;
}
const services = [
  [
    'admission-letter',
    '/verify/admission-letter',
    'Admission letter number',
    'Verify Admission Letter',
  ],
  ['certificate', '/verify/certificate', 'Certificate number', 'Verify Certificate'],
  ['registration', '/verify/registration', 'Registration number', 'Verify Registration'],
  ['result', '/results', 'Your registration number', 'Show my results'],
] as const;
/** Check Result's own-results form sits behind a disclosure; open it before filling. */
async function openOwnResults(page: Page) {
  const summary = page.getByText('Student? See your own published marks after signing in');
  if ((await summary.locator('xpath=..').getAttribute('open')) === null) await summary.click();
}
for (const [service, path, label, action] of services) {
  test(`${service}: real database boundary and accessible mobile form`, async ({ page }) => {
    await page.goto(path);
    if (service === 'result') {
      // No course has an anonymous result policy here: the three-field form says so honestly.
      await expect(
        page.getByRole('option', { name: 'No course offers online result checks yet' }),
      ).toBeAttached();
      await expect(page.getByRole('button', { name: 'Check Result', exact: true })).toBeDisabled();
      await openOwnResults(page);
    }
    await page.getByLabel(label, { exact: true }).fill(`0000-E2E-${service}`);
    const response = page.waitForResponse(
      (r) => r.url().endsWith(`/public/verify/${service}`) && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: action, exact: true }).click();
    const received = await response;
    expect(received.status()).toBe(200);
    expect(((await received.json()) as { status: string }).status).toBe('UNAVAILABLE');
    await expect(page.getByRole('status')).toContainText('No record was checked.');
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoHorizontalOverflow(page);
      await expectNoSeriousA11yViolations(page);
      await capture(page, `verification-${service}-${width}`);
    }
  });
}
test('secure QR fragment is removed and submitted without putting credentials in request URLs', async ({
  page,
}) => {
  const token = 'a'.repeat(43);
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.goto(`/verify/certificate#token=${token}`);
  await expect(page.getByRole('status')).toContainText('Secure QR code ready');
  await expect(page.getByLabel('Certificate number', { exact: true })).toHaveValue('');
  await expect(page).toHaveURL(/\/verify\/certificate$/);
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/public/verify/certificate') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Verify Certificate', exact: true }).click();
  const r = await response;
  expect(r.request().postDataJSON()).toEqual({ contractVersion: 2, token });
  expect(urls.some((url) => url.includes(token))).toBe(false);
});
test('existing activated student session works for registration and results without granting cross-student access', async ({
  page,
}) => {
  const student = fixtures().profileStudents[0];
  if (!student) throw new Error('Missing synthetic student');
  await studentSignIn(page, student);
  for (const [id, path, label, action] of services.filter(
    ([id]) => id === 'registration' || id === 'result',
  )) {
    await page.goto(path);
    if (id === 'result') await openOwnResults(page);
    await page.getByLabel(label, { exact: true }).fill(student.registrationNumber);
    await page.getByRole('button', { name: action, exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Verification not available');
  }
});

test('synthetic approved records: admission QR, certificate revocation, exact registration, private published results', async ({
  browser,
  page,
  playwright,
}, testInfo) => {
  test.setTimeout(180000);
  const f = fixtures(),
    baseURL = testInfo.project.use.baseURL;
  const maker = await playwright.request.newContext({ baseURL }),
    checker = await playwright.request.newContext({ baseURL });
  async function login(client: typeof maker, account: typeof f.admin) {
    const csrf = ((await (await client.get('/api/v1/auth/csrf')).json()) as { csrfToken: string })
      .csrfToken;
    expect(
      (
        await client.post('/api/v1/auth/login', {
          headers: { 'X-CSRF-Token': csrf },
          data: { email: account.email, password: account.password },
        })
      ).status(),
    ).toBe(200);
  }
  async function post(
    client: typeof maker,
    path: string,
    data: object = {},
  ): Promise<WorkflowResponse> {
    const csrf = ((await (await client.get('/api/v1/auth/csrf')).json()) as { csrfToken: string })
      .csrfToken;
    const r = await client.post(`/api/v1/${path}`, { headers: { 'X-CSRF-Token': csrf }, data });
    expect(r.status(), await r.text()).toBeLessThan(300);
    return (await r.json()) as WorkflowResponse;
  }
  try {
    await login(maker, f.admin);
    await login(checker, f.paymentChecker);
    const course = await post(maker, 'programs', {
      code: `PV-${Date.now()}`,
      name: 'Synthetic Public Verification Course',
      academicStructure: 'SEMESTER_WISE',
      periodCount: 2,
    });
    const policies: Record<string, string> = {};
    for (const service of ['admission-letter', 'certificate', 'registration', 'result']) {
      const policy = await post(maker, 'verification-policies', {
        service,
        programId: course.id,
        definition: {
          usage: 'OFFICIAL',
          institutionName: 'Synthetic Test University',
          authorizationReference: 'SYNTHETIC E2E DATABASE ONLY',
          discloseProgram: true,
          discloseIssueDate: true,
          identityFactor: 'AUTHENTICATED_OWNER',
          resultMode: 'REVIEWED_VALUES_ONLY',
          ...(service === 'certificate'
            ? {
                application: {
                  certificateType: 'TRANSCRIPT',
                  eligibilityReference: 'Synthetic active program registration',
                  fields: { purposeRequired: true, remarksAllowed: false },
                  evidence: { requirement: 'NONE', authorityReference: 'Synthetic evidence rule' },
                  fee: {
                    kind: 'APPROVED_EXEMPTION',
                    authorityReference: 'Synthetic fee exemption',
                  },
                  actions: ['SUBMIT', 'RESPOND', 'CANCEL'],
                  reviewAuthorityReference: 'Synthetic staff review authority',
                },
              }
            : {}),
        },
      });
      await post(checker, `verification-policies/${policy.id}/approve`);
      policies[service] = policy.id;
    }
    const admissionPolicy = policies['admission-letter'];
    if (!admissionPolicy) throw new Error('Missing synthetic admission policy');
    const number = `0000${Date.now()}`;
    const student = await post(maker, 'students', {
      student: { fullName: 'Synthetic Verification Learner' },
      registration: {
        registrationNumber: number,
        programId: course.id,
        academicSessionId: f.examProgram.sessionId,
      },
    });
    const registrationId = student.registrations[0]?.id;
    if (!registrationId) throw new Error('Missing synthetic registration');
    // Prepare a static synthetic PDF through the real staff upload and maker/checker lifecycle.
    const pdf = Buffer.from(
      '%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF',
    );
    const makerBrowser = await browser.newContext({ storageState: await maker.storageState() });
    const checkerBrowser = await browser.newContext({ storageState: await checker.storageState() });
    const makerPage = await makerBrowser.newPage();
    const checkerPage = await checkerBrowser.newPage();
    const templateName = `Synthetic E2E Admission ${Date.now()}`;
    await makerPage.goto('/admin/official-records');
    await makerPage.getByRole('tab', { name: 'Templates', exact: true }).click();
    await makerPage.getByLabel('Template program', { exact: true }).selectOption(course.id);
    await makerPage
      .getByLabel('Template document type', { exact: true })
      .selectOption('ADMISSION_LETTER');
    await makerPage
      .getByLabel('Approved template policy', { exact: true })
      .selectOption(admissionPolicy);
    await makerPage.getByLabel('University template name', { exact: true }).fill(templateName);
    await makerPage.getByRole('button', { name: 'Prepare template version', exact: true }).click();
    const makerTemplate = makerPage.getByRole('article').filter({ hasText: templateName });
    await expect(
      makerTemplate.getByRole('button', { name: 'Approve template', exact: true }),
    ).toBeDisabled();
    await checkerPage.goto('/admin/official-records');
    await checkerPage.getByRole('tab', { name: 'Templates', exact: true }).click();
    const checkerTemplate = checkerPage.getByRole('article').filter({ hasText: templateName });
    await checkerTemplate.getByRole('button', { name: 'Approve template', exact: true }).click();
    await expect(checkerTemplate).toContainText('ACTIVE');
    await makerPage.getByRole('tab', { name: 'Documents', exact: true }).click();
    await makerPage.getByLabel('Find registration', { exact: true }).fill(number);
    await makerPage.getByRole('button', { name: 'Find student registration', exact: true }).click();
    await makerPage.getByRole('button', { name: 'Use registration', exact: true }).click();
    await makerPage
      .getByLabel('Official document type', { exact: true })
      .selectOption('ADMISSION_LETTER');
    await makerPage
      .getByLabel('Document approval policy', { exact: true })
      .selectOption(admissionPolicy);
    await makerPage
      .getByLabel('Active official template', { exact: true })
      .selectOption({ label: `${templateName} · v1` });
    const documentNumber = `ADMIT-${Date.now()}`;
    await makerPage.getByLabel('Official document number', { exact: true }).fill(documentNumber);
    await makerPage.getByLabel('Approved issue date', { exact: true }).fill('2026-11-01');
    await makerPage
      .getByLabel('Issuance authority reference', { exact: true })
      .fill('Synthetic E2E authority only');
    await makerPage
      .getByLabel('University-approved PDF', { exact: true })
      .setInputFiles({ name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: pdf });
    const uploaded = makerPage.waitForResponse(
      (r) => r.url().endsWith('/official-documents') && r.request().method() === 'POST',
    );
    await makerPage
      .getByRole('button', { name: 'Prepare for independent approval', exact: true })
      .click();
    const upload = await uploaded;
    expect(upload.status(), await upload.text()).toBe(201);
    const document = (await upload.json()) as { id: string };
    const makerDocument = makerPage.getByRole('article').filter({ hasText: documentNumber });
    // The preparer sees why they cannot approve instead of a silent disabled button.
    await expect(makerDocument.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(
      0,
    );
    await expect(makerDocument).toContainText('another staff member must approve it');
    await expect(makerDocument).toContainText('Synthetic E2E authority only');
    await makerPage.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(makerPage);
    await expectNoSeriousA11yViolations(makerPage);
    await capture(makerPage, 'official-staff-document-mobile');
    await page.goto('/verify/admission-letter');
    await page.getByLabel('Admission letter number', { exact: true }).fill(documentNumber);
    await page.getByRole('button', { name: 'Verify Admission Letter', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('No verified record found');
    await checkerPage.getByRole('tab', { name: 'Documents', exact: true }).click();
    const checkerDocument = checkerPage.getByRole('article').filter({ hasText: documentNumber });
    await checkerDocument.getByRole('button', { name: 'Approve', exact: true }).click();
    const issuing = checkerPage.waitForResponse((r) =>
      r.url().endsWith(`/official-documents/${document.id}/issue`),
    );
    await checkerDocument.getByRole('button', { name: 'Issue Letter', exact: true }).click();
    const issuedResponse = await issuing;
    expect(issuedResponse.status()).toBe(200);
    const issued = (await issuedResponse.json()) as WorkflowResponse;
    const qr = new URL(issued.verificationUrl);
    await page.goto(qr.pathname + qr.hash);
    await page.getByRole('button', { name: 'Verify Admission Letter', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Admission Letter Verified');
    await expect(page.getByRole('status')).toContainText('VALID');
    await expect(page.getByRole('status')).toContainText('Synthetic Test University');
    await expect(page.locator('main')).not.toContainText('Synthetic Verification Learner');
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(page);
    await capture(page, 'verification-admission-issued-mobile');
    await checkerDocument.getByRole('button', { name: 'Revoke document', exact: true }).click();
    await checkerDocument
      .getByLabel('Revocation reason', { exact: true })
      .fill('Synthetic E2E revocation');
    await checkerDocument.getByRole('button', { name: 'Confirm revocation', exact: true }).click();
    await expect(checkerDocument).toContainText('REVOKED');
    await checkerPage.getByRole('tab', { name: 'Policies', exact: true }).click();
    for (const [service, audience] of [
      ['admission-letter', 'Anyone with the document number or secure QR code'],
      ['certificate', 'Anyone with the document number or secure QR code'],
      ['registration', 'Only the signed-in student can check their own registration'],
      ['result', 'Only the signed-in student can view their own published results'],
    ] as const) {
      await checkerPage.getByLabel('Verification service', { exact: true }).selectOption(service);
      await expect(
        checkerPage
          .locator('form')
          .filter({ has: checkerPage.getByLabel('Verification service', { exact: true }) }),
      ).toContainText(audience);
      const card = checkerPage.getByRole('article').filter({
        has: checkerPage.getByText(
          new RegExp('^' + service + ' · APPROVED · Synthetic Public Verification Course$'),
        ),
      });
      await expect(card).toContainText(audience);
      await card.getByText('Review proposed rules', { exact: true }).click();
      if (service === 'result')
        await expect(card).toContainText('Independently reviewed and published results');
      else await expect(card).toContainText('Program name');
    }
    await checkerPage.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(checkerPage);
    await expectNoSeriousA11yViolations(checkerPage);
    await capture(checkerPage, 'official-staff-policy-mobile');
    await checkerPage.getByRole('tab', { name: 'Audit', exact: true }).click();
    await expect(
      checkerPage.getByRole('heading', { name: 'Verification and issuance audit', exact: true }),
    ).toBeVisible();
    await expect(checkerPage.getByRole('article').first()).toBeVisible();
    await page.getByRole('button', { name: 'Verify Admission Letter', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Admission Letter Revoked');
    // Activation uses the existing per-registration identity flow and random password.
    const activation = await post(maker, 'student-accounts/activation-codes', {
      registrationIds: [registrationId],
    });
    const password = `Synthetic-E2E-${Date.now()}-private`;
    const activationCode = activation.issued[0]?.code;
    if (!activationCode) throw new Error('Missing synthetic activation code');
    await page.goto('/student/register');
    await page.getByLabel('Registration number', { exact: true }).fill(number);
    await page.getByLabel('Activation code').fill(activationCode);
    // Submit via the same activation endpoint to avoid assuming password form labels.
    const studentCsrf = (
      (await (await page.request.get('/api/v1/student-auth/csrf')).json()) as { csrfToken: string }
    ).csrfToken;
    expect(
      (
        await page.request.post('/api/v1/student-auth/activate', {
          headers: { 'X-CSRF-Token': studentCsrf },
          data: { registrationNumber: number, activationCode: activationCode, password },
        })
      ).status(),
    ).toBe(200);
    // The real application/review pipeline uses an explicitly approved synthetic university policy.
    const applicationCsrf = (
      (await (await page.request.get('/api/v1/student-auth/csrf')).json()) as { csrfToken: string }
    ).csrfToken;
    const application = await page.request.post('/api/v1/student/certificate-requests', {
      headers: { 'X-CSRF-Token': applicationCsrf },
      data: {
        certificateType: 'TRANSCRIPT',
        purpose: 'Synthetic application',
        submissionKey: crypto.randomUUID(),
      },
    });
    expect(application.status(), await application.text()).toBe(201);
    const requestId = ((await application.json()) as { id: string }).id;
    await post(maker, `certificate-requests/${requestId}/record-review`, {
      version: 1,
      privateNote: 'Synthetic university staff review',
    });
    await post(maker, `certificate-requests/${requestId}/complete-review`, { version: 2 });
    const certTemplate = await post(maker, 'official-documents/templates', {
      policyId: policies.certificate,
      programId: course.id,
      documentType: 'TRANSCRIPT',
      name: `Synthetic E2E Transcript ${Date.now()}`,
    });
    await post(checker, `official-documents/templates/${certTemplate.id}/approve`);
    const certNumber = `CERT-${Date.now()}`.padEnd(64, '1');
    // Guided certificate issuance, opened from the reviewed application.
    await makerPage.goto(
      `/admin/official-records?tab=documents&type=TRANSCRIPT&requestId=${requestId}`,
    );
    await expect(makerPage.getByRole('heading', { name: 'Issue Certificate' })).toBeVisible();
    await makerPage
      .getByRole('button', { name: /Use the applicant of the reviewed application/ })
      .click();
    await makerPage.getByRole('button', { name: new RegExp(`^Select .*, ${number}$`) }).click();
    await expect(
      makerPage.getByRole('listitem').filter({ hasText: 'Select Certificate Type' }),
    ).toHaveAttribute('aria-current', 'step');
    await expect(makerPage.getByRole('combobox', { name: /^Certificate Type/ })).toHaveValue(
      'TRANSCRIPT',
    );
    await expect(makerPage.getByRole('radio', { name: 'Generate PDF' })).toBeDisabled();
    await makerPage.getByLabel('Certificate Number', { exact: true }).fill(certNumber);
    await makerPage.getByLabel('Issue Date', { exact: true }).fill('2026-11-01');
    await makerPage.getByText('Advanced details').click();
    await makerPage
      .getByLabel('Issuance authority reference', { exact: true })
      .fill('Synthetic E2E certificate authority');
    await makerPage
      .getByLabel('Signed PDF (max 10 MB)')
      .setInputFiles({ name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: pdf });
    await makerPage.getByRole('button', { name: 'Preview Certificate' }).click();
    await expectNoSeriousA11yViolations(makerPage);
    await capture(makerPage, 'certificate-issue-desktop');
    const certUploading = makerPage.waitForResponse(
      (r) => r.url().endsWith('/official-documents') && r.request().method() === 'POST',
    );
    await makerPage.getByRole('button', { name: 'Submit for Approval' }).click();
    const certUpload = await certUploading;
    expect(certUpload.status(), await certUpload.text()).toBe(201);
    const cert = (await certUpload.json()) as { id: string };
    await expect(
      makerPage.getByRole('article').filter({ hasText: certNumber.slice(0, 20) }),
    ).toContainText('another staff member must approve it');
    await makerBrowser.close();
    await checkerBrowser.close();
    await post(checker, `official-documents/${cert.id}/approve`);
    await post(checker, `official-documents/${cert.id}/issue`);
    await page.goto('/verify/certificate');
    await page.getByLabel('Certificate number', { exact: true }).fill(certNumber);
    await page.getByRole('button', { name: 'Verify Certificate', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Certificate Valid');
    await capture(page, 'verification-certificate-issued-mobile');
    await page.goto('/verify/registration');
    await page.getByLabel('Registration number', { exact: true }).fill(number);
    await page.getByRole('button', { name: 'Verify Registration', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('ACTIVE');
    await page.getByLabel('Registration number', { exact: true }).fill(number.slice(1));
    await page.getByRole('button', { name: 'Verify Registration', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('No verified record found');
    const curriculum = await post(maker, `programs/${course.id}/curricula`, {
      versionCode: `PV-${Date.now()}`,
      name: 'Synthetic Verification Syllabus',
    });
    const subject = await post(maker, 'subjects', {
      code: `PV-S-${Date.now()}`,
      name: 'Synthetic Academic Subject',
      category: 'THEORY',
    });
    await post(maker, `curricula/${curriculum.id}/subjects`, {
      subjectId: subject.id,
      periodNumber: 1,
      classification: 'THEORY',
      maxMarks: 100,
      components: [
        { name: 'Internal', maxMarks: 30 },
        { name: 'External', maxMarks: 70 },
      ],
    });
    await post(maker, `curricula/${curriculum.id}/activate`);
    await post(maker, `curricula/${curriculum.id}/registrations`, {
      registrationIds: [registrationId],
    });
    const detail = (await (await maker.get(`/api/v1/curricula/${curriculum.id}`)).json()) as {
      periods: { subjects: { id: string }[] }[];
    };
    const ps = detail.periods[0]?.subjects[0]?.id;
    if (!ps) throw new Error('Missing synthetic subject');
    const exam = await post(maker, 'examinations', {
      code: `PV-E-${Date.now()}`,
      name: 'Synthetic Published Examination',
      curriculumId: curriculum.id,
      academicSessionId: f.examProgram.sessionId,
      periodNumber: 1,
      kind: 'REGULAR',
      examSession: 'Synthetic November 2026',
    });
    await post(maker, `examinations/${exam.id}/open`);
    const draft = await post(maker, 'draft-results', {
      context: {
        programId: course.id,
        curriculumId: curriculum.id,
        academicSessionId: f.examProgram.sessionId,
        periodNumber: 1,
        examinationId: exam.id,
      },
      registrationId,
      programSubjectId: ps,
      reExamApplicationId: null,
      expectedVersion: null,
      marks: {
        internalMarks: '20',
        externalMarks: '60',
        practicalMarks: null,
        otherMarks: null,
        totalMarks: '80',
      },
    });
    await page.goto('/results');
    await openOwnResults(page);
    await page.getByLabel('Your registration number', { exact: true }).fill(number);
    await page.getByRole('button', { name: 'Show my results', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('No published result');

    const review = (await (await maker.get(`/api/v1/result-review/${draft.resultId}`)).json()) as {
      subjects: { id: string }[];
    };
    await post(maker, `official-results/${draft.resultId}/attest`, {
      policyId: policies.result,
      expectedVersion: 1,
      authorityReference: 'Synthetic university decision',
      outcome: 'PASS',
      totalMarks: '80',
      maxMarks: '100',
      sgpa: null,
      cgpa: null,
      subjects: review.subjects.map((s: { id: string }) => ({
        id: s.id,
        status: 'PASS',
        grade: 'A',
      })),
    });
    await post(maker, `result-review/${draft.resultId}/submit`, {
      requestId: crypto.randomUUID(),
      expectedVersion: 2,
      confirmed: true,
    });
    await post(checker, `result-review/${draft.resultId}/approve`, {
      requestId: crypto.randomUUID(),
      expectedVersion: 3,
      confirmed: true,
    });
    await post(checker, `official-results/${draft.resultId}/publish`, {
      policyId: policies.result,
      expectedVersion: 4,
    });
    await page.getByRole('button', { name: 'Show my results', exact: true }).click();
    const marks = page.getByRole('region', { name: /subject marks/ });
    await expect(marks).toContainText('80');
    await expect(marks).toContainText('100');
    await expect(marks).toContainText('Pass');
    // The owner's marksheet carries its genuine QR verification code.
    await expect(page.getByRole('img', { name: 'Verification QR code' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Print Marksheet/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture(page, 'verification-results-issued-mobile');
    await page.emulateMedia({ media: 'print' });
    await expect(marks).toBeVisible();
    await page.pdf({ path: 'test-results/published-results-print.pdf', format: 'A4' });
    await page.emulateMedia({ media: 'screen' });
    await page.goto('/student/results');
    await expect(page.getByRole('article')).toContainText('Not supplied');
    await capture(page, 'verification-student-results-mobile');
    await page.goto('/student/documents');
    await expect(page.getByRole('region', { name: 'Official issued documents' })).toContainText(
      certNumber,
    );
    await expectNoHorizontalOverflow(page);
    await capture(page, 'verification-student-documents-mobile');
    await page.goto('/results');
    await openOwnResults(page);
    await page.getByLabel('Your registration number', { exact: true }).fill(number);
    await page.getByRole('button', { name: 'Show my results', exact: true }).click();
    await expect(page.getByRole('region', { name: /subject marks/ })).toBeVisible();
    const ownDownload = await page.request.get(
      `/api/v1/student/official-documents/${cert.id}/download`,
    );
    expect(ownDownload.status()).toBe(200);
    const stranger = await browser.newContext({ baseURL });
    const strangerPage = await stranger.newPage();
    const otherStudent = f.profileStudents[0];
    if (!otherStudent) throw new Error('Missing second synthetic student');
    await studentSignIn(strangerPage, otherStudent);
    expect((await stranger.request.get(`/api/v1/student/results/${draft.resultId}`)).status()).toBe(
      404,
    );
    expect(
      (
        await stranger.request.get(`/api/v1/student/official-documents/${cert.id}/download`)
      ).status(),
    ).toBe(404);
    await stranger.close();

    await post(checker, `official-documents/${cert.id}/revoke`, {
      reason: 'Synthetic E2E revoked certificate',
    });
    await post(checker, `official-results/${draft.resultId}/withdraw`);
    await page.getByRole('button', { name: 'Show my results', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('No published result');
  } finally {
    await maker.dispose();
    await checker.dispose();
  }
});

/**
 * Guided admission-letter issuance with synthetic records only: one staff member selects the
 * student and generates the letter from records; a second approves and issues it; the public
 * verifies it by letter number and by QR.
 */
test('issue admission letter in five steps: generate, independent approval, issue, verify', async ({
  browser,
  page,
  playwright,
}, testInfo) => {
  test.setTimeout(180000);
  const f = fixtures(),
    baseURL = testInfo.project.use.baseURL;
  const maker = await playwright.request.newContext({ baseURL }),
    checker = await playwright.request.newContext({ baseURL });
  async function call(
    client: APIRequestContext,
    method: 'POST' | 'PATCH',
    path: string,
    data = {},
  ) {
    const csrf = ((await (await client.get('/api/v1/auth/csrf')).json()) as { csrfToken: string })
      .csrfToken;
    const r = await client.fetch(`/api/v1/${path}`, {
      method,
      headers: { 'X-CSRF-Token': csrf },
      data,
    });
    expect(r.status(), await r.text()).toBeLessThan(300);
    return (await r.json()) as { id: string; registrations: { id: string }[] };
  }
  const login = (client: APIRequestContext, account: typeof f.admin) =>
    call(client, 'POST', 'auth/login', { email: account.email, password: account.password });
  try {
    await login(maker, f.admin);
    await login(checker, f.paymentChecker);
    const stamp = Date.now();
    const course = await call(maker, 'POST', 'programs', {
      code: `AL-${stamp}`,
      name: 'Synthetic Admission Course',
      level: 'CERTIFICATE',
      durationValue: 6,
      durationUnit: 'MONTHS',
    });
    const policy = await call(maker, 'POST', 'verification-policies', {
      service: 'admission-letter',
      programId: course.id,
      definition: {
        usage: 'OFFICIAL',
        institutionName: 'Synthetic Test University',
        authorizationReference: 'SYNTHETIC E2E DATABASE ONLY',
        discloseProgram: true,
        discloseIssueDate: true,
        identityFactor: 'AUTHENTICATED_OWNER',
        resultMode: 'REVIEWED_VALUES_ONLY',
      },
    });
    await call(checker, 'POST', `verification-policies/${policy.id}/approve`);
    const template = await call(maker, 'POST', 'official-documents/templates', {
      policyId: policy.id,
      programId: course.id,
      documentType: 'ADMISSION_LETTER',
      name: `Synthetic Admission Letter ${stamp}`,
    });
    await call(checker, 'POST', `official-documents/templates/${template.id}/approve`);
    const number = `AL-REG-${stamp}`;
    const student = await call(maker, 'POST', 'students', {
      student: { fullName: 'Synthetic Admission Learner' },
      registration: {
        registrationNumber: number,
        programId: course.id,
        academicSessionId: f.examProgram.sessionId,
      },
    });

    const makerPage = await (
      await browser.newContext({ storageState: await maker.storageState() })
    ).newPage();
    await makerPage.setViewportSize({ width: 1440, height: 1000 });
    await makerPage.goto('/admin/official-records?tab=documents&type=ADMISSION_LETTER');
    await expect(makerPage.getByRole('heading', { name: 'Issue Admission Letter' })).toBeVisible();
    await expect(
      makerPage.getByRole('list', { name: 'Admission letter steps' }).getByRole('listitem'),
    ).toHaveText([
      /Select Student/,
      /Confirm Letter Details/,
      /Generate or Upload PDF/,
      /Review and Approve/,
      /Issue and Verify/,
    ]);
    await capture(makerPage, 'admission-letter-step1-desktop');

    // Step 1: find the student by registration number.
    await makerPage.getByLabel('Registration number or student name').fill(number);
    await makerPage.getByRole('button', { name: 'Select Student', exact: true }).click();
    await makerPage
      .getByRole('button', { name: `Select Synthetic Admission Learner, ${number}` })
      .click();

    await expect(
      makerPage.getByRole('listitem').filter({ hasText: 'Confirm Letter Details' }),
    ).toHaveAttribute('aria-current', 'step');
    // Step 2: authoritative details; nationality is missing, so generation explains the gap.
    await expect(makerPage.getByText('Not recorded')).toBeVisible();
    await makerPage.getByLabel('Letter Number').fill(`AL-${stamp}`);
    await makerPage.getByText('Advanced details').click();
    await makerPage.getByLabel('Issuance authority reference').fill('Synthetic E2E authority only');
    await makerPage.getByRole('button', { name: 'Generate PDF', exact: true }).click();
    await expect(makerPage.getByRole('alert').filter({ hasText: /nationality/ })).toBeVisible();
    await call(maker, 'PATCH', `students/${student.id}`, { nationality: 'Testland' });
    await makerPage.reload();
    await makerPage.getByLabel('Registration number or student name').fill(number);
    await makerPage.getByRole('button', { name: 'Select Student', exact: true }).click();
    await makerPage
      .getByRole('button', { name: `Select Synthetic Admission Learner, ${number}` })
      .click();
    await expect(makerPage.getByRole('definition').filter({ hasText: /^Testland$/ })).toBeVisible();
    await expect(makerPage.getByText('Synthetic Admission Course').first()).toBeVisible();
    await expect(
      makerPage.getByRole('definition').filter({ hasText: /^CERTIFICATE$/ }),
    ).toBeVisible();
    await makerPage.getByLabel('Letter Number').fill(`AL-${stamp}`);
    await makerPage.getByText('Advanced details').click();
    await makerPage.getByLabel('Issuance authority reference').fill('Synthetic E2E authority only');

    // Step 3: generate and preview, then submit for independent approval.
    await expect(makerPage.getByRole('button', { name: 'Submit for Approval' })).toBeDisabled();
    await makerPage.getByRole('button', { name: 'Generate PDF', exact: true }).click();
    await expect(makerPage.getByTitle('Admission letter preview')).toBeVisible();
    await expect(
      makerPage.getByRole('listitem').filter({ hasText: 'Generate or Upload PDF' }),
    ).toHaveAttribute('aria-current', 'step');
    await expectNoSeriousA11yViolations(makerPage);
    await capture(makerPage, 'admission-letter-preview-desktop');
    const prepared = makerPage.waitForResponse(
      (r) => r.url().endsWith('/official-documents') && r.request().method() === 'POST',
    );
    await makerPage.getByRole('button', { name: 'Submit for Approval' }).click();
    expect((await prepared).status()).toBe(201);
    const makerDocument = makerPage.getByRole('article').filter({ hasText: `AL-${stamp}` });
    await expect(makerDocument).toContainText('another staff member must approve it');
    await expect(
      makerPage.getByRole('listitem').filter({ hasText: 'Review and Approve' }),
    ).toHaveAttribute('aria-current', 'step');

    // Steps 4–5: a different staff member approves and issues.
    const checkerPage = await (
      await browser.newContext({ storageState: await checker.storageState() })
    ).newPage();
    await checkerPage.goto('/admin/official-records?tab=documents&type=ADMISSION_LETTER');
    const checkerDocument = checkerPage.getByRole('article').filter({ hasText: `AL-${stamp}` });
    await expect(checkerDocument).toContainText('Next: review the PDF and approve.');
    await checkerDocument.getByRole('button', { name: 'Approve', exact: true }).click();
    const issuing = checkerPage.waitForResponse((r) => r.url().endsWith('/issue'));
    await checkerDocument.getByRole('button', { name: 'Issue Letter', exact: true }).click();
    const issued = (await (await issuing).json()) as { verificationUrl: string };
    expect(new URL(issued.verificationUrl).pathname).toBe('/verify/admission-letter');
    await expect(checkerPage.getByRole('img', { name: /QR/i }).first()).toBeVisible();
    await expect(checkerDocument.getByRole('link', { name: 'Verify Letter' })).toBeVisible();
    await capture(checkerPage, 'admission-letter-issued-desktop');

    // Public verification by number (no sign-in) and by QR; nationality is never shown.
    await page.goto('/verify/admission-letter');
    await page.getByLabel('Admission letter number', { exact: true }).fill(`AL-${stamp}`);
    await page.getByRole('button', { name: 'Verify Admission Letter', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Admission Letter Verified');
    await expect(page.locator('main')).not.toContainText('Testland');
    const qr = new URL(issued.verificationUrl);
    await page.goto(qr.pathname + qr.hash);
    await page.getByRole('button', { name: 'Verify Admission Letter', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Admission Letter Verified');

    await makerPage.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(makerPage);
    await capture(makerPage, 'admission-letter-mobile');
  } finally {
    await maker.dispose();
    await checker.dispose();
  }
});
