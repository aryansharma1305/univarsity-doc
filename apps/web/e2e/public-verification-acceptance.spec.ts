import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  fixtures,
  type Account,
} from './support';

/**
 * Acceptance: positive, revoked and published states of the public verification pages at every
 * supported width (1440/768/390/320), plus the print view of published results. All records are
 * synthetic, created through the real staff/student APIs in the disposable `_e2e` database with
 * role-separated accounts (SUPER_ADMIN proposer/attester, second SUPER_ADMIN approver, EXAM_ADMIN
 * marks author/submitter, APPROVER publisher/issuer).
 */
const WIDTHS = [1440, 768, 390, 320] as const;
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF',
);

interface Created {
  id: string;
  resultId: string;
  registrations: { id: string }[];
  issued: { code: string }[];
  verificationUrl: string;
  periods: { subjects: { id: string }[] }[];
  subjects: { id: string }[];
}

async function signedIn(
  playwright: { request: { newContext: (o: object) => Promise<APIRequestContext> } },
  baseURL: string | undefined,
  account: Account,
) {
  const client = await playwright.request.newContext({ baseURL });
  const csrf = async () =>
    ((await (await client.get('/api/v1/auth/csrf')).json()) as { csrfToken: string }).csrfToken;
  const login = await client.post('/api/v1/auth/login', {
    headers: { 'X-CSRF-Token': await csrf() },
    data: { email: account.email, password: account.password },
  });
  expect(login.status()).toBe(200);
  return {
    client,
    async post(path: string, data: object = {}): Promise<Created> {
      const r = await client.post(`/api/v1/${path}`, {
        headers: { 'X-CSRF-Token': await csrf() },
        data,
      });
      expect(r.status(), `${path}: ${await r.text()}`).toBeLessThan(300);
      return (await r.json()) as Created;
    },
    async get(path: string): Promise<Created> {
      const r = await client.get(`/api/v1/${path}`);
      expect(r.status()).toBe(200);
      return (await r.json()) as Created;
    },
    async upload(metadata: object): Promise<Created> {
      const r = await client.post('/api/v1/official-documents', {
        headers: { 'X-CSRF-Token': await csrf() },
        multipart: {
          metadata: JSON.stringify(metadata),
          file: { name: 'document.pdf', mimeType: 'application/pdf', buffer: PDF },
        },
      });
      expect(r.status(), await r.text()).toBe(201);
      return (await r.json()) as Created;
    },
  };
}

/**
 * Submits the form. Earlier specs in the same run share the 20-checks-per-minute client budget; a
 * rate-limited check is a correct, recoverable outcome, so wait out the window once and retry.
 */
async function verifyNow(page: Page) {
  const verify = page.getByRole('button', { name: 'Verify', exact: true });
  const limited = page.getByRole('alert').filter({ hasText: 'Too many checks' });
  await verify.click();
  await expect(page.locator('main form')).toHaveAttribute('aria-busy', 'false', {
    timeout: 15_000,
  });
  if (await limited.isVisible()) {
    await page.waitForTimeout(61_000);
    await verify.click();
    await expect(page.locator('main form')).toHaveAttribute('aria-busy', 'false', {
      timeout: 15_000,
    });
  }
}

async function atEveryWidth(page: Page, check: () => Promise<void>) {
  for (const width of WIDTHS)
    await test.step(`${String(width)}px`, async () => {
      await page.setViewportSize({ width, height: 900 });
      await check();
      await expectNoHorizontalOverflow(page);
      await expectNoSeriousA11yViolations(page);
    });
}

test('acceptance: issued, revoked and published states are responsive and printable', async ({
  page,
  playwright,
}, testInfo) => {
  test.setTimeout(420_000);
  const f = fixtures(),
    baseURL = testInfo.project.use.baseURL;
  const proposer = await signedIn(playwright, baseURL, f.admin);
  const checker = await signedIn(playwright, baseURL, f.paymentChecker);
  const examAdmin = await signedIn(playwright, baseURL, f.examAdmin);
  const approver = await signedIn(playwright, baseURL, f.approver);
  try {
    const stamp = String(Date.now());
    const course = await proposer.post('programs', {
      code: `PVA-${stamp}`,
      name: 'Acceptance Verification Course',
      academicStructure: 'SEMESTER_WISE',
      periodCount: 2,
    });
    const policies: Record<string, string> = {};
    for (const service of ['admission-letter', 'registration', 'result']) {
      const p = await proposer.post('verification-policies', {
        service,
        programId: course.id,
        definition: {
          usage: 'OFFICIAL',
          institutionName: 'Acceptance Test University',
          authorizationReference: 'LOCAL E2E DATABASE ONLY',
          discloseProgram: true,
          discloseIssueDate: true,
          identityFactor: 'AUTHENTICATED_OWNER',
          resultMode: 'REVIEWED_VALUES_ONLY',
        },
      });
      await checker.post(`verification-policies/${p.id}/approve`);
      policies[service] = p.id;
    }
    const number = `000${stamp.slice(-8)}`;
    const student = await proposer.post('students', {
      student: { fullName: 'Acceptance Hidden Learner' },
      registration: {
        registrationNumber: number,
        programId: course.id,
        academicSessionId: f.examProgram.sessionId,
      },
    });
    const registrationId = student.registrations[0]?.id ?? '';

    // Admission letter: issued (QR) then revoked, at every width.
    const template = await proposer.post('official-documents/templates', {
      policyId: policies['admission-letter'],
      programId: course.id,
      documentType: 'ADMISSION_LETTER',
      name: `Acceptance admission ${stamp}`,
    });
    await approver.post(`official-documents/templates/${template.id}/approve`);
    const letter = await proposer.upload({
      registrationId,
      policyId: policies['admission-letter'],
      templateId: template.id,
      documentType: 'ADMISSION_LETTER',
      certificateNumber: `PVA-AL-${stamp}`,
      issueDate: '2026-11-01',
      authorityReference: 'Local e2e authority',
    });
    await approver.post(`official-documents/${letter.id}/approve`);
    const issued = await approver.post(`official-documents/${letter.id}/issue`);
    const qr = new URL(issued.verificationUrl);
    await page.goto(qr.pathname + qr.hash);
    await expect(page).toHaveURL(/\/verify\/admission-letter$/);
    await verifyNow(page);
    await expect(page.getByRole('status')).toContainText('VALID');
    await atEveryWidth(page, async () => {
      await expect(page.getByRole('status')).toContainText('Acceptance Test University');
      await expect(page.locator('main')).not.toContainText('Acceptance Hidden Learner');
    });
    await approver.post(`official-documents/${letter.id}/revoke`, {
      reason: 'Local e2e revocation',
    });
    await verifyNow(page);
    await expect(page.getByRole('status')).toContainText('REVOKED');
    await atEveryWidth(page, async () => {
      await expect(page.getByRole('status')).toContainText('REVOKED');
    });

    // Published results: role-separated workflow, then owner lookup at every width and print.
    const curriculum = await proposer.post(`programs/${course.id}/curricula`, {
      versionCode: `PVA-${stamp}`,
      name: 'Acceptance syllabus',
    });
    const subject = await proposer.post('subjects', {
      code: `PVA-S-${stamp}`,
      name: 'Acceptance Academic Subject',
      category: 'THEORY',
    });
    await proposer.post(`curricula/${curriculum.id}/subjects`, {
      subjectId: subject.id,
      periodNumber: 1,
      classification: 'THEORY',
      maxMarks: 100,
      components: [
        { name: 'Internal', maxMarks: 30 },
        { name: 'External', maxMarks: 70 },
      ],
    });
    await proposer.post(`curricula/${curriculum.id}/activate`);
    await proposer.post(`curricula/${curriculum.id}/registrations`, {
      registrationIds: [registrationId],
    });
    const ps = (await proposer.get(`curricula/${curriculum.id}`)).periods[0]?.subjects[0]?.id;
    const exam = await examAdmin.post('examinations', {
      code: `PVA-E-${stamp}`,
      name: 'Acceptance Published Examination',
      curriculumId: curriculum.id,
      academicSessionId: f.examProgram.sessionId,
      periodNumber: 1,
      kind: 'REGULAR',
      examSession: 'Acceptance November 2026',
    });
    await examAdmin.post(`examinations/${exam.id}/open`);
    const draft = await examAdmin.post('draft-results', {
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
        internalMarks: '22',
        externalMarks: '61',
        practicalMarks: null,
        otherMarks: null,
        totalMarks: '83',
      },
    });
    const review = await proposer.get(`result-review/${draft.resultId}`);
    await proposer.post(`official-results/${draft.resultId}/attest`, {
      policyId: policies.result,
      expectedVersion: 1,
      authorityReference: 'Local e2e examination decision',
      outcome: 'PASS',
      totalMarks: '83',
      maxMarks: '100',
      sgpa: null,
      cgpa: null,
      subjects: review.subjects.map((s) => ({ id: s.id, status: 'PASS', grade: 'A' })),
    });
    await examAdmin.post(`result-review/${draft.resultId}/submit`, {
      requestId: crypto.randomUUID(),
      expectedVersion: 2,
      confirmed: true,
    });
    await checker.post(`result-review/${draft.resultId}/approve`, {
      requestId: crypto.randomUUID(),
      expectedVersion: 3,
      confirmed: true,
    });
    await approver.post(`official-results/${draft.resultId}/publish`, {
      policyId: policies.result,
      expectedVersion: 4,
    });

    const activation = await proposer.post('student-accounts/activation-codes', {
      registrationIds: [registrationId],
    });
    const studentCsrf = async () =>
      (
        (await (await page.request.get('/api/v1/student-auth/csrf')).json()) as {
          csrfToken: string;
        }
      ).csrfToken;
    expect(
      (
        await page.request.post('/api/v1/student-auth/activate', {
          headers: { 'X-CSRF-Token': await studentCsrf() },
          data: {
            registrationNumber: number,
            activationCode: activation.issued[0]?.code,
            password: `Acceptance-E2E-${stamp}-private`,
          },
        })
      ).status(),
    ).toBe(200);

    await page.goto('/verify/registration');
    await page.getByLabel('Registration number', { exact: true }).fill(number);
    await verifyNow(page);
    await expect(page.getByRole('status')).toContainText('ACTIVE');
    await atEveryWidth(page, async () => {
      await expect(page.getByRole('status')).toContainText('ACTIVE');
    });

    await page.goto('/results');
    await page.getByLabel('Registration number', { exact: true }).fill(number);
    await verifyNow(page);
    await atEveryWidth(page, async () => {
      await expect(page.getByRole('table')).toContainText('83 / 100');
      await expect(page.getByRole('button', { name: 'Print published results' })).toBeVisible();
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('table')).toContainText('PASS');
    // Only the marked area prints: the lookup form and print control are hidden.
    await expect(page.getByRole('button', { name: 'Verify', exact: true })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Print published results' })).toBeHidden();
    await expect(page.getByLabel('Registration number', { exact: true })).toBeHidden();
    await page.emulateMedia({ media: 'screen' });
  } finally {
    for (const c of [proposer, checker, examAdmin, approver]) await c.client.dispose();
  }
});
