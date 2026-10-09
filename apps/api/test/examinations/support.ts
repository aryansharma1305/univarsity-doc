import type { INestApplication } from '@nestjs/common';
import { expect } from 'vitest';
import {
  assignCurriculumResultSchema,
  curriculumDetailSchema,
  examinationDetailSchema,
  programSchema,
  subjectSchema,
} from '@docversity/validation';
import { browser, type Staff, testDb, uniqueCode } from '../helpers.js';
import { existingStudent, masterData, tag } from '../imports/support.js';
import { activate, issueCode } from '../student-auth/support.js';

/**
 * Synthetic academic fixtures for Phase 9 tests, built through the real API so every Phase 7B rule
 * applies: a course (semester- or year-wise), an ACTIVE curriculum with subjects in each period, and
 * a registration explicitly assigned to it with an activated student account.
 */
export async function academicFixture(
  app: INestApplication,
  registrar: Staff,
  options: {
    structure?: 'SEMESTER_WISE' | 'YEAR_WISE';
    periods?: number;
    subjectsPerPeriod?: number;
  } = {},
) {
  const structure = options.structure ?? 'SEMESTER_WISE';
  const periods = options.periods ?? 2;
  const program = programSchema.parse(
    (
      await registrar
        .post('programs', {
          code: uniqueCode('EXC'),
          name: `Synthetic ${structure === 'YEAR_WISE' ? 'Diploma' : 'Certificate'} ${tag()}`,
          level: 'CERTIFICATE',
          durationValue: 1,
          durationUnit: 'YEARS',
          academicStructure: structure,
          periodCount: periods,
        })
        .expect(201)
    ).body,
  );
  const draft = curriculumDetailSchema.parse(
    (
      await registrar
        .post(`programs/${program.id}/curricula`, {
          versionCode: `V${tag()}`,
          name: 'Synthetic syllabus',
        })
        .expect(201)
    ).body,
  );
  const subjects: { id: string; code: string; name: string; period: number }[] = [];
  for (let period = 1; period <= periods; period += 1) {
    for (let index = 0; index < (options.subjectsPerPeriod ?? 2); index += 1) {
      const subject = subjectSchema.parse(
        (
          await registrar
            .post('subjects', {
              code: uniqueCode('SUB'),
              name: `Synthetic Subject P${String(period)}-${String(index + 1)} ${tag()}`,
              category: 'THEORY',
            })
            .expect(201)
        ).body,
      );
      await registrar
        .post(`curricula/${draft.id}/subjects`, {
          subjectId: subject.id,
          periodNumber: period,
          classification: 'THEORY',
        })
        .expect(201);
      subjects.push({ id: subject.id, code: subject.code, name: subject.name, period });
    }
  }
  const curriculum = curriculumDetailSchema.parse(
    (await registrar.post(`curricula/${draft.id}/activate`).expect(200)).body,
  );
  const master = await masterData();
  return { program, curriculum, subjects, master, structure, periods };
}

export type AcademicFixture = Awaited<ReturnType<typeof academicFixture>>;

/** A registration in the fixture's program, assigned to its curriculum, with an active account. */
export async function enrolledStudent(
  app: INestApplication,
  registrar: Staff,
  fixture: AcademicFixture,
  options: { assign?: boolean } = {},
) {
  const registrationNumber = `EXS-${tag()}`;
  const student = await existingStudent(fixture.master, registrationNumber, {
    programId: fixture.program.id,
    fullName: `Synthetic Examinee ${tag()}`,
  });
  const registrationId = student.registrations[0]?.id ?? '';
  if (options.assign !== false) {
    const result = assignCurriculumResultSchema.parse(
      (
        await registrar
          .post(`curricula/${fixture.curriculum.id}/registrations`, {
            registrationIds: [registrationId],
          })
          .expect(200)
      ).body,
    );
    expect(result.assigned).toBe(1);
  }
  const code = await issueCode(registrar, registrationId);
  const agent = browser(app);
  const activated = await activate(agent, { registrationNumber, activationCode: code });
  expect(activated.status, JSON.stringify(activated.body)).toBe(200);
  return { studentId: student.id, registrationId, registrationNumber, agent };
}

/** An examination record through the API, optionally opened (and accepting re-exam applications). */
export async function examination(
  examAdmin: Staff,
  fixture: AcademicFixture,
  options: {
    kind?: 'REGULAR' | 'RE_EXAMINATION';
    period?: number;
    open?: boolean;
    acceptApplications?: boolean;
  } = {},
) {
  const created = await examAdmin.post('examinations', {
    code: uniqueCode('EXM'),
    name: `Synthetic ${options.kind === 'RE_EXAMINATION' ? 'Re-examination' : 'Examination'} ${tag()}`,
    curriculumId: fixture.curriculum.id,
    academicSessionId: fixture.master.session.id,
    periodNumber: options.period ?? 1,
    kind: options.kind ?? 'REGULAR',
    examSession: 'Synthetic May–June 2026',
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  let exam = examinationDetailSchema.parse(created.body);
  if (options.open !== false && (options.open || options.acceptApplications)) {
    exam = examinationDetailSchema.parse(
      (await examAdmin.post(`examinations/${exam.id}/open`).expect(200)).body,
    );
  }
  if (options.acceptApplications) {
    exam = examinationDetailSchema.parse(
      (
        await examAdmin
          .post(`examinations/${exam.id}/re-exam-applications`, { open: true })
          .expect(200)
      ).body,
    );
  }
  return exam;
}

export { testDb };
