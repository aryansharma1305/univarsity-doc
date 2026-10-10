import { randomInt } from 'node:crypto';
import { buildWorkbook, type FixtureCell } from '@docversity/imports/testing';
import {
  assignCurriculumResultSchema,
  curriculumDetailSchema,
  examinationDetailSchema,
  programSchema,
  type ResultPreview,
  resultPreviewSchema,
  subjectSchema,
} from '@docversity/validation';
import { expect } from 'vitest';
import { type Staff, uniqueCode } from '../helpers.js';
import { existingStudent, masterData, tag, XLSX } from '../imports/support.js';

/** Header row of the results template (grade excluded). */
export const RESULT_HEADERS = [
  'Registration Number',
  'Subject Code',
  'Internal Marks',
  'External Marks',
  'Practical Marks',
  'Other Marks',
  'Total Marks',
];

/** A synthetic registration number with leading zeros (e.g. 00412345). */
export function zeroPaddedNumber(): string {
  return `00${String(randomInt(100_000, 999_999))}`;
}

interface SubjectSpec {
  period: number;
  maxMarks?: number;
  components?: { name: string; maxMarks: number }[];
}

/**
 * A course built through the real API with one curriculum version per entry of `versions` (each with
 * its own non-overlapping effective window so several can be ACTIVE), the given subjects in every
 * version, and helpers to enrol students and create examinations.
 */
export async function resultsFixture(
  registrar: Staff,
  examAdmin: Staff,
  options: {
    structure?: 'SEMESTER_WISE' | 'YEAR_WISE';
    periods?: number;
    subjects?: SubjectSpec[];
    versions?: number;
  } = {},
) {
  const structure = options.structure ?? 'SEMESTER_WISE';
  const periods = options.periods ?? 2;
  const specs = options.subjects ?? [
    {
      period: 1,
      maxMarks: 100,
      components: [
        { name: 'Internal', maxMarks: 30 },
        { name: 'External', maxMarks: 70 },
      ],
    },
    { period: 1, maxMarks: 50 },
    { period: 2, maxMarks: 100 },
  ];
  const program = programSchema.parse(
    (
      await registrar
        .post('programs', {
          code: uniqueCode('RES'),
          name: `Synthetic Results Course ${tag()}`,
          level: 'CERTIFICATE',
          durationValue: 1,
          durationUnit: 'YEARS',
          academicStructure: structure,
          periodCount: periods,
        })
        .expect(201)
    ).body,
  );
  const subjects: { id: string; code: string; spec: SubjectSpec }[] = [];
  for (const spec of specs) {
    const subject = subjectSchema.parse(
      (
        await registrar
          .post('subjects', {
            code: uniqueCode('RSB'),
            name: `Synthetic Results Subject ${tag()}`,
            category: 'THEORY',
          })
          .expect(201)
      ).body,
    );
    subjects.push({ id: subject.id, code: subject.code, spec });
  }
  const curricula = [];
  for (let version = 0; version < (options.versions ?? 1); version += 1) {
    const year = 2020 + version;
    const draft = curriculumDetailSchema.parse(
      (
        await registrar
          .post(`programs/${program.id}/curricula`, {
            versionCode: `V${String(year)}-${tag()}`,
            name: `Synthetic syllabus ${String(year)}`,
            effectiveFrom: `${String(year)}-01-01`,
            effectiveTo: `${String(year)}-12-31`,
          })
          .expect(201)
      ).body,
    );
    for (const subject of subjects) {
      await registrar
        .post(`curricula/${draft.id}/subjects`, {
          subjectId: subject.id,
          periodNumber: subject.spec.period,
          classification: 'THEORY',
          maxMarks: subject.spec.maxMarks ?? null,
          ...(subject.spec.components ? { components: subject.spec.components } : {}),
        })
        .expect(201);
    }
    curricula.push(
      curriculumDetailSchema.parse(
        (await registrar.post(`curricula/${draft.id}/activate`).expect(200)).body,
      ),
    );
  }
  const master = await masterData();
  const curriculum = curricula[0];
  if (!curriculum) throw new Error('no curriculum');

  return {
    program,
    curriculum,
    curricula,
    subjects,
    master,
    structure,
    /** A registration of this course (text number with leading zeros), optionally assigned. */
    async student(options: { curriculumId?: string | null; programId?: string } = {}) {
      const registrationNumber = zeroPaddedNumber();
      const student = await existingStudent(master, registrationNumber, {
        programId: options.programId ?? program.id,
        fullName: `Synthetic Results Student ${tag()}`,
      });
      const registrationId = student.registrations[0]?.id ?? '';
      const assignTo = options.curriculumId === undefined ? curriculum.id : options.curriculumId;
      if (assignTo) {
        const result = assignCurriculumResultSchema.parse(
          (
            await registrar
              .post(`curricula/${assignTo}/registrations`, { registrationIds: [registrationId] })
              .expect(200)
          ).body,
        );
        expect(result.assigned).toBe(1);
      }
      return { registrationNumber, registrationId };
    },
    async examination(
      options: { period?: number; open?: boolean; curriculumId?: string; sessionId?: string } = {},
    ) {
      const created = await examAdmin.post('examinations', {
        code: uniqueCode('REX'),
        name: `Synthetic Results Examination ${tag()}`,
        curriculumId: options.curriculumId ?? curriculum.id,
        academicSessionId: options.sessionId ?? master.session.id,
        periodNumber: options.period ?? 1,
        kind: 'REGULAR',
        examSession: 'Synthetic May–June 2026',
      });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      let exam = examinationDetailSchema.parse(created.body);
      if (options.open !== false) {
        exam = examinationDetailSchema.parse(
          (await examAdmin.post(`examinations/${exam.id}/open`).expect(200)).body,
        );
      }
      return exam;
    },
  };
}

export type ResultsFixture = Awaited<ReturnType<typeof resultsFixture>>;

export function contextFor(
  fixture: ResultsFixture,
  exam: { id: string; period: { number: number } },
  curriculumId = fixture.curriculum.id,
) {
  return {
    programId: fixture.program.id,
    curriculumId,
    academicSessionId: fixture.master.session.id,
    periodNumber: String(exam.period.number),
    examinationId: exam.id,
  };
}

export function workbook(rows: FixtureCell[][], headers = RESULT_HEADERS, name = 'Results') {
  return buildWorkbook([{ name, rows: [headers, ...rows] }]);
}

export function uploadPreview(
  staff: Staff,
  context: Record<string, string>,
  bytes: Uint8Array,
  filename = 'results.xlsx',
  type = XLSX,
) {
  const request = staff.agent
    .post('/api/v1/result-imports/previews')
    .set('X-CSRF-Token', staff.csrf);
  for (const [key, value] of Object.entries(context)) void request.field(key, value);
  return request.attach('file', Buffer.from(bytes), { filename, contentType: type });
}

export function previewOf(response: { body: unknown }): ResultPreview {
  return resultPreviewSchema.parse(response.body);
}

/** The template mapping: columns A–G in template order. */
export const TEMPLATE_MAPPING = {
  worksheet: 'Results',
  columns: {
    registrationNumber: 1,
    subjectCode: 2,
    internalMarks: 3,
    externalMarks: 4,
    practicalMarks: 5,
    otherMarks: 6,
    totalMarks: 7,
  },
};
