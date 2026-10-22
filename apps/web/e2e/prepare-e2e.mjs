// Runs before the e2e API server starts (see playwright.config.ts):
//   1. recreates the disposable `<dev db>_e2e` database from the real migrations;
//   2. creates a SUPER_ADMIN through the same code path as `pnpm admin:create`, with a RANDOM
//      password written to a git-ignored file for the browser test. No credentials are hard-coded.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from '@docversity/database';
import { prepareTestDatabase } from '@docversity/database/testing';
import { createAdmin } from '../../api/dist/cli/create-admin-core.js';
import { PasswordService } from '../../api/dist/auth/password.service.js';
import { ensureRoles } from '../../api/dist/cli/roles.js';

const baseUrl = process.env.E2E_BASE_DATABASE_URL;
if (!baseUrl) throw new Error('E2E_BASE_DATABASE_URL is required');

const databaseUrl = await prepareTestDatabase({ baseUrl, suffix: '_e2e' });
const credentials = {
  email: `e2e.admin.${randomUUID().slice(0, 8)}@example.test`,
  password: randomBytes(24).toString('base64url'),
  displayName: 'E2E Test Admin',
};
const viewer = {
  email: `e2e.viewer.${randomUUID().slice(0, 8)}@example.test`,
  password: randomBytes(24).toString('base64url'),
  displayName: 'E2E Test Viewer',
};
const registrar = {
  email: `e2e.registrar.${randomUUID().slice(0, 8)}@example.test`,
  password: randomBytes(24).toString('base64url'),
  displayName: 'E2E Test Registrar',
};
const examAdmin = {
  email: `e2e.examadmin.${randomUUID().slice(0, 8)}@example.test`,
  password: randomBytes(24).toString('base64url'),
  displayName: 'E2E Exam Admin',
};
// Phase 9C: a second SUPER_ADMIN (approves payment details prepared by the first — maker–checker)
// and an APPROVER (verifies payments).
const paymentChecker = {
  email: `e2e.checker.${randomUUID().slice(0, 8)}@example.test`,
  password: randomBytes(24).toString('base64url'),
  displayName: 'E2E Payment Checker',
};
const approver = {
  email: `e2e.approver.${randomUUID().slice(0, 8)}@example.test`,
  password: randomBytes(24).toString('base64url'),
  displayName: 'E2E Payment Verifier',
};
let certificateRequestId;
let eligibilityStudent;
const eligibilityPrograms = {};
let sampleStudent;
let singleSampleStudent;
let fixture;
const profileStudents = [];
const examStudents = [];
let examProgram;
let examSessionId;
const db = createPrismaClient({ connectionString: databaseUrl });
try {
  await createAdmin(db, credentials);

  // A read-only staff member (test fixture, created directly — no admin bootstrap involved).
  await ensureRoles(db);
  const viewerRole = await db.role.findUniqueOrThrow({ where: { name: 'VIEWER' } });
  await db.user.create({
    data: {
      email: viewer.email,
      displayName: viewer.displayName,
      passwordHash: await new PasswordService().hashPassword(viewer.password),
      roles: { create: { roleId: viewerRole.id } },
    },
  });

  // A REGISTRAR (student imports, Phase 5).
  const registrarRole = await db.role.findUniqueOrThrow({ where: { name: 'REGISTRAR' } });
  await db.user.create({
    data: {
      email: registrar.email,
      displayName: registrar.displayName,
      passwordHash: await new PasswordService().hashPassword(registrar.password),
      roles: { create: { roleId: registrarRole.id } },
    },
  });

  for (const [account, roleName] of [
    [paymentChecker, 'SUPER_ADMIN'],
    [approver, 'APPROVER'],
  ]) {
    const role = await db.role.findUniqueOrThrow({ where: { name: roleName } });
    await db.user.create({
      data: {
        email: account.email,
        displayName: account.displayName,
        passwordHash: await new PasswordService().hashPassword(account.password),
        roles: { create: { roleId: role.id } },
      },
    });
  }

  // An EXAM_ADMIN (examination records and the external examination application links, Phase 9).
  const examAdminRole = await db.role.findUniqueOrThrow({ where: { name: 'EXAM_ADMIN' } });
  await db.user.create({
    data: {
      email: examAdmin.email,
      displayName: examAdmin.displayName,
      passwordHash: await new PasswordService().hashPassword(examAdmin.password),
      roles: { create: { roleId: examAdminRole.id } },
    },
  });

  // Minimal, clearly labelled academic data so read-only/mobile/a11y tests have something to show.
  const department = await db.department.create({
    data: { code: 'E2E-DEPT', name: 'E2E Fixture Department' },
  });
  const program = await db.program.create({
    data: {
      code: 'E2E-PROG',
      name: 'E2E Fixture Program',
      level: 'UG',
      durationSemesters: 8,
      departmentId: department.id,
    },
  });
  const session = await db.academicSession.create({
    data: { code: 'E2E-SESSION', name: 'E2E Fixture Session', status: 'ACTIVE' },
  });
  const student = await db.student.create({
    data: {
      fullName: 'E2E Fixture Student',
      registrations: {
        create: {
          registrationNumber: 'E2E-REG-0001',
          registrationNumberNormalized: 'E2E-REG-0001',
          programId: program.id,
          departmentId: department.id,
          academicSessionId: session.id,
        },
      },
    },
  });
  // Students with ACTIVE portal accounts for the profile request tests (Phase 7). Each test that
  // changes a record uses its own student, so the read-only fixture above stays unchanged.
  for (const [index, name] of ['E2E Profile Student', 'E2E Review Student'].entries()) {
    const registrationNumber = `E2E-REG-010${index + 1}`;
    const password = randomBytes(18).toString('base64url');
    const created = await db.student.create({
      data: {
        fullName: name,
        registrations: {
          create: {
            registrationNumber,
            registrationNumberNormalized: registrationNumber,
            programId: program.id,
            departmentId: department.id,
            academicSessionId: session.id,
          },
        },
        account: {
          create: { passwordHash: await new PasswordService().hashPassword(password) },
        },
      },
    });
    profileStudents.push({
      studentId: created.id,
      studentName: name,
      registrationNumber,
      password,
    });
  }
  // Phase 9: a year-wise course and two students with portal accounts. The curriculum is built and
  // assigned by the test through the real API, so every curriculum rule applies.
  examProgram = await db.program.create({
    data: {
      code: 'E2E-EXAM-PROG',
      name: 'E2E Synthetic Diploma',
      level: 'DIPLOMA',
      academicStructure: 'YEAR_WISE',
      periodCount: 2,
      durationValue: 2,
      durationUnit: 'YEARS',
      departmentId: department.id,
    },
  });
  examSessionId = session.id;
  for (const [index, name] of ['E2E Examinee Alpha', 'E2E Examinee Beta'].entries()) {
    const registrationNumber = `E2E-REG-020${index + 1}`;
    const password = randomBytes(18).toString('base64url');
    const created = await db.student.create({
      data: {
        fullName: name,
        registrations: {
          create: {
            registrationNumber,
            registrationNumberNormalized: registrationNumber,
            programId: examProgram.id,
            departmentId: department.id,
            academicSessionId: session.id,
          },
        },
        account: {
          create: { passwordHash: await new PasswordService().hashPassword(password) },
        },
      },
      include: { registrations: true },
    });
    examStudents.push({
      studentId: created.id,
      studentName: name,
      registrationNumber,
      registrationId: created.registrations[0].id,
      password,
    });
  }
  fixture = {
    studentId: student.id,
    studentName: student.fullName,
    registrationNumber: 'E2E-REG-0001',
    programCode: program.code,
    sessionCode: session.code,
  };
  // Phase 12B: existing synthetic request only; no active university application policy is seeded.
  const certificateStudent = profileStudents[0];
  if (!certificateStudent) throw new Error('Missing synthetic certificate student');
  const request = await db.certificateRequest.create({
    data: {
      reference: 'CR-E2E-SYNTHETIC-APPLICATION',
      studentId: certificateStudent.studentId,
      certificateType: 'TRANSCRIPT',
      policyId: 'SYNTHETIC-ISOLATED-E2E',
      policyVersion: 1,
      policySnapshot: { synthetic: true },
      purpose: 'Synthetic application for further study.',
      submissionKey: randomUUID(),
      events: {
        create: {
          version: 1,
          status: 'SUBMITTED',
          action: 'SUBMIT',
          actorStudentId: certificateStudent.studentId,
        },
      },
    },
  });
  certificateRequestId = request.id;

  // Phase 12C: synthetic courses (3/18/36/12 months) and one student registered on all four, so the
  // registration-specific eligibility labels can be shown. Disposable _e2e database only. The approved
  // 3-month set is written as PROPOSED by the registrar fixture and decided by the admin fixture (the
  // database's separation-of-duties checks apply); no approval authority is activated in the API.
  const proposer = await db.user.findUniqueOrThrow({ where: { email: registrar.email } });
  const decider = await db.user.findUniqueOrThrow({ where: { email: credentials.email } });
  for (const [key, months, name] of [
    ['m3', 3, 'E2E Certificate Course in Clinical Data Handling'],
    ['m18', 18, 'E2E Postgraduate Diploma in Applied Research'],
    ['m36', 36, 'E2E Bachelor of Applied Studies'],
    ['m12', 12, 'E2E One-Year Diploma'],
  ]) {
    const created = await db.program.create({
      data: {
        code: `E2E-ELIG-${months}M`,
        name,
        durationValue: months % 12 === 0 ? months / 12 : months,
        durationUnit: months % 12 === 0 ? 'YEARS' : 'MONTHS',
        departmentId: department.id,
      },
    });
    eligibilityPrograms[key] = created.id;
  }
  const eligibilityPassword = randomBytes(18).toString('base64url');
  const eligibilityCreated = await db.student.create({
    data: {
      fullName: 'E2E Eligibility Student',
      registrations: {
        create: ['m3', 'm18', 'm36', 'm12'].map((key, i) => ({
          registrationNumber: `E2E-REG-030${i + 1}`,
          registrationNumberNormalized: `E2E-REG-030${i + 1}`,
          programId: eligibilityPrograms[key],
          departmentId: department.id,
          academicSessionId: session.id,
        })),
      },
      account: {
        create: { passwordHash: await new PasswordService().hashPassword(eligibilityPassword) },
      },
    },
  });
  eligibilityStudent = {
    studentId: eligibilityCreated.id,
    studentName: 'E2E Eligibility Student',
    registrationNumber: 'E2E-REG-0301',
    password: eligibilityPassword,
  };
  const proposal = (programId, certificateTypes, durationMonths, tier) =>
    db.programCertificateEligibility.create({
      data: {
        programId,
        revision: 1,
        certificateTypes,
        policyId: 'UNIVERSITY_COURSE_DURATION_CERTIFICATES',
        policyVersion: 1,
        durationMonths,
        tier,
        authorityReference: 'Synthetic e2e university decision',
        proposedByUserId: proposer.id,
      },
    });
  const shortSet = await proposal(eligibilityPrograms.m3, ['COURSE_COMPLETION'], 3, 'SHORT_COURSE');
  await db.programCertificateEligibility.update({
    where: { id: shortSet.id },
    data: { status: 'APPROVED', version: 2, decidedByUserId: decider.id, decidedAt: new Date() },
  });
  await proposal(
    eligibilityPrograms.m18,
    ['TRANSCRIPT', 'PROVISIONAL', 'CHARACTER'],
    18,
    'MORE_THAN_ONE_YEAR',
  );

  // Phase 12C.1: registration-specific academic samples. Separate synthetic courses and students, so
  // the Phase 12C fixtures above are unchanged. Approved and withdrawn sets exist only in this
  // disposable _e2e database; no approval authority is activated in the API.
  const sampleCourse = async (code, name, durationValue, durationUnit) =>
    (
      await db.program.create({
        data: { code, name, durationValue, durationUnit, departmentId: department.id },
      })
    ).id;
  const m24 = await sampleCourse('E2E-SAMPLE-24M', 'E2E Master of Applied Studies', 2, 'YEARS');
  const m36 = await sampleCourse('E2E-SAMPLE-36M', 'E2E Bachelor of Science (Honours)', 3, 'YEARS');
  const m18w = await sampleCourse('E2E-SAMPLE-18W', 'E2E Diploma in Data Practice', 18, 'MONTHS');
  const approve = async (programId, certificateTypes, durationMonths, tier) => {
    const set = await proposal(programId, certificateTypes, durationMonths, tier);
    await db.programCertificateEligibility.update({
      where: { id: set.id },
      data: { status: 'APPROVED', version: 2, decidedByUserId: decider.id, decidedAt: new Date() },
    });
  };
  await approve(m24, ['TRANSCRIPT', 'PROVISIONAL', 'CHARACTER'], 24, 'MORE_THAN_ONE_YEAR');
  await approve(
    m36,
    ['TRANSCRIPT', 'PROVISIONAL', 'CHARACTER', 'MIGRATION'],
    36,
    'MORE_THAN_TWO_YEARS',
  );
  const withdrawn = await proposal(m18w, ['TRANSCRIPT'], 18, 'MORE_THAN_ONE_YEAR');
  await db.programCertificateEligibility.update({
    where: { id: withdrawn.id },
    data: { status: 'WITHDRAWN', version: 2, decidedByUserId: proposer.id, decidedAt: new Date() },
  });
  const sampleAccount = async (fullName, programIds, firstNumber) => {
    const password = randomBytes(18).toString('base64url');
    const created = await db.student.create({
      data: {
        fullName,
        registrations: {
          create: programIds.map((programId, i) => ({
            registrationNumber: `E2E-REG-${firstNumber + i}`,
            registrationNumberNormalized: `E2E-REG-${firstNumber + i}`,
            programId,
            departmentId: department.id,
            academicSessionId: session.id,
          })),
        },
        account: { create: { passwordHash: await new PasswordService().hashPassword(password) } },
      },
    });
    return {
      studentId: created.id,
      studentName: fullName,
      registrationNumber: `E2E-REG-${firstNumber}`,
      password,
    };
  };
  sampleStudent = await sampleAccount(
    'E2E Sample Student',
    [eligibilityPrograms.m3, m24, m36, m18w, eligibilityPrograms.m12],
    401,
  );
  singleSampleStudent = await sampleAccount('E2E Single Course Student', [m24], 501);
} finally {
  await db.$disconnect();
}

const dir = fileURLToPath(new URL('../.e2e/', import.meta.url));
mkdirSync(dir, { recursive: true });
writeFileSync(
  `${dir}credentials.json`,
  JSON.stringify({
    ...credentials,
    admin: credentials,
    viewer,
    registrar,
    fixture,
    profileStudents,
    certificateRequestId,
    eligibilityStudent,
    eligibilityPrograms,
    sampleStudent,
    singleSampleStudent,
    examAdmin,
    paymentChecker,
    approver,
    examStudents,
    examProgram: { id: examProgram.id, code: examProgram.code, sessionId: examSessionId },
  }),
  { mode: 0o600 },
);
console.log('e2e database and admin fixture ready');
