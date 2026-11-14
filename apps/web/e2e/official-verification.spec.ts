import { createPrismaClient } from '@docversity/database';
import { expect, test } from '@playwright/test';
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
  ['admission-letter', '/verify/admission-letter', 'Admission letter number'],
  ['certificate', '/verify/certificate', 'Certificate number'],
  ['registration', '/verify/registration', 'Registration number'],
  ['result', '/results', 'Registration number'],
] as const;
for (const [service, path, label] of services) {
  test(`${service}: real database boundary and accessible mobile form`, async ({ page }) => {
    await page.goto(path);
    await page.getByLabel(label, { exact: true }).fill(`0000-E2E-${service}`);
    const response = page.waitForResponse(
      (r) => r.url().endsWith(`/public/verify/${service}`) && r.request().method() === 'POST',
    );
    await page
      .getByRole('button', {
        name: service === 'result' ? 'Check result' : 'Verify record',
        exact: true,
      })
      .click();
    const received = await response;
    expect(received.status()).toBe(200);
    expect(((await received.json()) as { status: string }).status).toBe('UNAVAILABLE');
    await expect(page.getByRole('status')).toContainText('No verified record is available');
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
  await expect(page.getByLabel('Secure QR token (optional)')).toHaveValue(token);
  await expect(page).toHaveURL(/\/verify\/certificate$/);
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/public/verify/certificate') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Verify record', exact: true }).click();
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
  for (const [service, path] of services.filter(
    ([id]) => id === 'registration' || id === 'result',
  )) {
    await page.goto(path);
    await page.getByLabel('Registration number', { exact: true }).fill(student.registrationNumber);
    await page
      .getByRole('button', {
        name: service === 'result' ? 'Check result' : 'Verify record',
        exact: true,
      })
      .click();
    await expect(page.getByRole('status')).toContainText('UNAVAILABLE');
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
        },
      });
      await post(checker, `verification-policies/${policy.id}/approve`);
      policies[service] = policy.id;
    }
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
    const template = await post(maker, 'official-documents/templates', {
      policyId: policies['admission-letter'],
      programId: course.id,
      documentType: 'ADMISSION_LETTER',
      name: `Synthetic E2E Admission ${Date.now()}`,
    });
    await post(checker, `official-documents/templates/${template.id}/approve`);
    const documentNumber = `ADMIT-${Date.now()}`;
    const csrf = ((await (await maker.get('/api/v1/auth/csrf')).json()) as { csrfToken: string })
      .csrfToken;
    const upload = await maker.post('/api/v1/official-documents', {
      headers: { 'X-CSRF-Token': csrf },
      multipart: {
        metadata: JSON.stringify({
          registrationId,
          policyId: policies['admission-letter'],
          templateId: template.id,
          documentType: 'ADMISSION_LETTER',
          certificateNumber: documentNumber,
          issueDate: '2026-11-01',
          authorityReference: 'Synthetic E2E authority only',
        }),
        file: { name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: pdf },
      },
    });
    expect(upload.status(), await upload.text()).toBe(201);
    const document = (await upload.json()) as { id: string };
    await page.goto('/verify/admission-letter');
    await page.getByLabel('Admission letter number', { exact: true }).fill(documentNumber);
    await page.getByRole('button', { name: 'Verify record', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('NOT FOUND');
    await post(checker, `official-documents/${document.id}/approve`);
    const issued = await post(checker, `official-documents/${document.id}/issue`);
    const qr = new URL(issued.verificationUrl);
    await page.goto(qr.pathname + qr.hash);
    await page.getByRole('button', { name: 'Verify record', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('VALID');
    await expect(page.getByRole('status')).toContainText('Synthetic Test University');
    await expect(page.locator('main')).not.toContainText('Synthetic Verification Learner');
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(page);
    await capture(page, 'verification-admission-issued-mobile');
    await post(checker, `official-documents/${document.id}/revoke`, {
      reason: 'Synthetic E2E revocation',
    });
    await page.getByRole('button', { name: 'Verify record', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('REVOKED');
    // Synthetic database fixture for an already reviewed certificate request. No live request policy is enabled.
    const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
    databaseUrl.pathname += '_e2e';
    if (
      !['localhost', '127.0.0.1', 'postgres'].includes(databaseUrl.hostname) ||
      !databaseUrl.pathname.endsWith('_e2e')
    )
      throw new Error('Refusing non-E2E certificate fixture');
    const db = createPrismaClient({ connectionString: databaseUrl.href });
    let requestId: string;
    try {
      const actor = (await (await maker.get('/api/v1/auth/me')).json()) as { id: string };
      const request = await db.certificateRequest.create({
        data: {
          reference: `E2E-REQUEST-${Date.now()}`,
          studentId: student.id,
          certificateType: 'TRANSCRIPT',
          policyId: 'SYNTHETIC-E2E-REQUEST',
          policyVersion: 1,
          policySnapshot: { usage: 'SYNTHETIC_ONLY' },
          purpose: 'Synthetic fixture',
          submissionKey: crypto.randomUUID(),
          events: {
            create: {
              version: 1,
              status: 'SUBMITTED',
              action: 'SUBMIT',
              actorStudentId: student.id,
            },
          },
        },
      });
      await db.certificateRequest.update({
        where: { id: request.id },
        data: {
          status: 'UNDER_REVIEW',
          version: 2,
          events: {
            create: {
              version: 2,
              status: 'UNDER_REVIEW',
              action: 'RECORD_REVIEW',
              privateNote: 'Synthetic review fixture only',
              actorUserId: actor.id,
            },
          },
        },
      });
      await db.certificateRequest.update({
        where: { id: request.id },
        data: {
          status: 'REVIEW_COMPLETED',
          version: 3,
          events: {
            create: {
              version: 3,
              status: 'REVIEW_COMPLETED',
              action: 'COMPLETE_REVIEW',
              actorUserId: actor.id,
            },
          },
        },
      });
      requestId = request.id;
    } finally {
      await db.$disconnect();
    }
    const certTemplate = await post(maker, 'official-documents/templates', {
      policyId: policies.certificate,
      programId: course.id,
      documentType: 'TRANSCRIPT',
      name: `Synthetic E2E Transcript ${Date.now()}`,
    });
    await post(checker, `official-documents/templates/${certTemplate.id}/approve`);
    const certNumber = `CERT-${Date.now()}`.padEnd(64, '1');
    const certCsrf = (
      (await (await maker.get('/api/v1/auth/csrf')).json()) as { csrfToken: string }
    ).csrfToken;
    const certUpload = await maker.post('/api/v1/official-documents', {
      headers: { 'X-CSRF-Token': certCsrf },
      multipart: {
        metadata: JSON.stringify({
          registrationId,
          requestId,
          policyId: policies.certificate,
          templateId: certTemplate.id,
          documentType: 'TRANSCRIPT',
          certificateNumber: certNumber,
          issueDate: '2026-11-01',
          authorityReference: 'Synthetic E2E certificate authority',
        }),
        file: { name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: pdf },
      },
    });
    expect(certUpload.status(), await certUpload.text()).toBe(201);
    const cert = (await certUpload.json()) as { id: string };
    await post(checker, `official-documents/${cert.id}/approve`);
    await post(checker, `official-documents/${cert.id}/issue`);
    await page.goto('/verify/certificate');
    await page.getByLabel('Certificate number', { exact: true }).fill(certNumber);
    await page.getByRole('button', { name: 'Verify record', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('ISSUED');
    await capture(page, 'verification-certificate-issued-mobile');
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
    await page.goto('/verify/registration');
    await page.getByLabel('Registration number', { exact: true }).fill(number);
    await page.getByRole('button', { name: 'Verify record', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('ACTIVE');
    await page.getByLabel('Registration number', { exact: true }).fill(number.slice(1));
    await page.getByRole('button', { name: 'Verify record', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('INVALID');
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
    await page.getByLabel('Registration number', { exact: true }).fill(number);
    await page.getByRole('button', { name: 'Check result', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('UNPUBLISHED');
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
    await page.getByRole('button', { name: 'Check result', exact: true }).click();
    await expect(page.getByRole('table')).toContainText('80 / 100');
    await expect(page.getByRole('table')).toContainText('PASS');
    await expect(page.getByRole('button', { name: 'Print published results' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture(page, 'verification-results-issued-mobile');
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('table')).toBeVisible();
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
    await page.getByLabel('Registration number', { exact: true }).fill(number);
    await page.getByRole('button', { name: 'Check result', exact: true }).click();
    await expect(page.getByRole('table')).toBeVisible();
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
    await page.getByRole('button', { name: 'Check result', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('UNPUBLISHED');
  } finally {
    await maker.dispose();
    await checker.dispose();
  }
});
