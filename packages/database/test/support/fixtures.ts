import type { PrismaClient } from '../../src/index.js';
import { uid } from './db.js';

/**
 * Minimal record builders for schema tests. Every identifier carries a random suffix, so tests can
 * run in parallel against one database without cleaning up between tests.
 */
export function fixtures(db: PrismaClient) {
  async function program() {
    return db.program.create({ data: { code: `T-PROG-${uid()}`, name: 'Test program' } });
  }

  async function session() {
    return db.academicSession.create({ data: { code: `T-SES-${uid()}`, name: 'Test session' } });
  }

  async function registration(options: { programId?: string; academicSessionId?: string } = {}) {
    const programId = options.programId ?? (await program()).id;
    const academicSessionId = options.academicSessionId ?? (await session()).id;
    const registrationNumber = `T-REG-${uid()}`;
    return db.studentRegistration.create({
      data: {
        registrationNumber,
        registrationNumberNormalized: registrationNumber.toUpperCase(),
        program: { connect: { id: programId } },
        academicSession: { connect: { id: academicSessionId } },
        student: { create: { fullName: 'Test Student' } },
      },
    });
  }

  async function programSubject(programId: string) {
    const subject = await db.subject.create({
      data: { code: `T-SUB-${uid()}`, name: 'Test subject' },
    });
    // Phase 7B: assignments belong to a (DRAFT, hence editable) curriculum version of the program.
    const curriculum = await db.programCurriculum.upsert({
      where: { programId_versionCode: { programId, versionCode: 'TEST-1' } },
      update: {},
      create: {
        programId,
        versionCode: 'TEST-1',
        name: 'Test curriculum',
        structureType: 'SEMESTER_WISE',
        numberOfPeriods: 8,
      },
    });
    return db.programSubject.create({
      data: {
        programId,
        curriculumId: curriculum.id,
        subjectId: subject.id,
        semesterNumber: 1,
        curriculumVersion: 'TEST-1',
        credits: '4',
      },
    });
  }

  async function examination(programId: string, academicSessionId: string) {
    return db.examination.create({
      data: {
        code: `T-EXAM-${uid()}`,
        name: 'Test examination',
        programId,
        academicSessionId,
        semesterNumber: 1,
        examSession: 'TEST',
      },
    });
  }

  /** A registration plus an examination of the same program and session. */
  async function examContext() {
    const reg = await registration();
    const exam = await examination(reg.programId, reg.academicSessionId);
    return { registration: reg, examination: exam };
  }

  async function publishedResult() {
    const { registration: reg, examination: exam } = await examContext();
    const line = await programSubject(reg.programId);
    const result = await db.result.create({
      data: {
        studentRegistrationId: reg.id,
        examinationId: exam.id,
        outcome: 'PASS',
        totalMarks: '80',
        maxMarks: '100',
        items: {
          create: { programSubjectId: line.id, totalMarks: '80', maxMarks: '100', status: 'PASS' },
        },
      },
    });
    const published = await db.result.update({
      where: { id: result.id },
      data: { publicationStatus: 'PUBLISHED', approvedAt: new Date(), publishedAt: new Date() },
    });
    return { registration: reg, examination: exam, programSubject: line, result: published };
  }

  async function template(
    documentType: 'PROVISIONAL' | 'TRANSCRIPT' | 'CHARACTER' = 'PROVISIONAL',
  ) {
    return db.certificateTemplate.create({
      data: { name: `T-TPL-${uid()}`, documentType, version: 1 },
    });
  }

  /** A certificate in ISSUED state with a number and a 32-character token. */
  async function issuedCertificate(
    options: { documentType?: 'PROVISIONAL' | 'TRANSCRIPT' | 'CHARACTER' } = {},
  ) {
    const reg = await registration();
    const certificate = await db.certificate.create({
      data: {
        studentRegistrationId: reg.id,
        programId: reg.programId,
        documentType: options.documentType ?? 'PROVISIONAL',
        status: 'ISSUED',
        certificateNumber: `T-CERT-${uid()}`,
        verificationToken: token(),
        issueDate: new Date('2026-06-30'),
        issuedAt: new Date(),
        sourceSnapshot: { fixture: true },
      },
    });
    return { registration: reg, certificate };
  }

  return {
    program,
    session,
    registration,
    programSubject,
    examination,
    examContext,
    publishedResult,
    template,
    issuedCertificate,
  };
}

/** A token-shaped random string (32 chars) — format only, not a real verification token. */
export function token(): string {
  return `tok_${uid()}${uid()}${uid()}`.padEnd(32, 'x');
}
