import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  errorResponseSchema,
  savedDraftSchema,
  studentResultsPageSchema,
  type SaveDraft,
} from '@docversity/validation';
import { browser, createTestApp, realConfig, staff, testDb, type Staff } from '../helpers.js';
import { activate, activatedStudent, issueCode } from '../student-auth/support.js';
import { contextFor, resultsFixture } from '../result-imports/support.js';
import {
  ResultReviewService,
  RESULT_REVIEW_POLICY,
} from '../../src/results/result-review.service.js';
import { PrismaService } from '../../src/database/prisma.service.js';

let app: INestApplication, registrar: Staff, maker: Staff, checker: Staff;
beforeAll(async () => {
  app = await createTestApp(realConfig());
  registrar = await staff(app, ['REGISTRAR']);
  maker = await staff(app, ['EXAM_ADMIN']);
  checker = await staff(app, ['SUPER_ADMIN']);
});
afterAll(() => app.close());
afterEach(() => vi.restoreAllMocks());
const empty = {
  publicationAvailable: false,
  data: [],
  meta: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
} as const;

async function fixture(structure: 'SEMESTER_WISE' | 'YEAR_WISE') {
  const f = await resultsFixture(registrar, maker, {
    structure,
    subjects: [
      {
        period: 1,
        maxMarks: 100,
        components: [
          { name: 'Internal', maxMarks: 30 },
          { name: 'External', maxMarks: 70 },
        ],
      },
    ],
  });
  const exam = await f.examination();
  const student = await f.student();
  const line = await testDb().programSubject.findFirstOrThrow({
    where: { curriculumId: f.curriculum.id },
  });
  const body: SaveDraft = {
    context: { ...contextFor(f, exam), periodNumber: exam.period.number },
    registrationId: student.registrationId,
    programSubjectId: line.id,
    reExamApplicationId: null,
    expectedVersion: null,
    marks: {
      internalMarks: '0',
      externalMarks: null,
      practicalMarks: null,
      otherMarks: null,
      totalMarks: null,
    },
  };
  const draft = savedDraftSchema.parse((await maker.post('draft-results', body).expect(201)).body);
  const agent = browser(app);
  const code = await issueCode(registrar, student.registrationId);
  expect(
    (
      await activate(agent, {
        registrationNumber: student.registrationNumber,
        activationCode: code,
      })
    ).status,
  ).toBe(200);
  return { agent, student, draft, body };
}

describe('student results publication boundary', () => {
  it('denies anonymous and staff-only sessions with non-cacheable responses', async () => {
    for (const route of ['/api/v1/student/results', `/api/v1/student/results/${randomUUID()}`]) {
      const anonymous = await browser(app).get(route).expect(401);
      const staffOnly = await maker.agent.get(route).expect(401);
      expect(anonymous.headers['cache-control']).toBe('no-store');
      expect(staffOnly.headers['cache-control']).toBe('no-store');
    }
  });
  it('returns a validated empty page and bounds pagination without accepting identity filters', async () => {
    const { agent } = await activatedStudent(app, registrar);
    const r = await agent.get('/api/v1/student/results?page=3&pageSize=100').expect(200);
    expect(studentResultsPageSchema.parse(r.body)).toEqual({
      ...empty,
      meta: { ...empty.meta, page: 3, pageSize: 100 },
    });
    expect(r.headers['cache-control']).toBe('no-store');
    for (const query of [
      'page=0',
      'page=100001',
      'pageSize=101',
      'pageSize=1.5',
      'studentId=' + randomUUID(),
      'registrationNumber=E2E-FOREIGN',
    ]) {
      const invalid = await agent.get('/api/v1/student/results?' + query).expect(400);
      expect(invalid.headers['cache-control']).toBe('no-store');
    }
  });
  it.each(['SEMESTER_WISE', 'YEAR_WISE'] as const)(
    '%s: hides own and foreign drafts, review snapshots and unknown IDs without writes',
    async (structure) => {
      const f = await fixture(structure);
      const other = await activatedStudent(app, registrar);
      const snapshot = async () => ({
        result: await testDb().result.findUniqueOrThrow({ where: { id: f.draft.resultId } }),
        items: await testDb().resultItem.findMany({
          where: { resultId: f.draft.resultId },
          orderBy: { id: 'asc' },
        }),
        events: await testDb().resultReviewEvent.findMany({
          where: { resultId: f.draft.resultId },
          orderBy: { id: 'asc' },
        }),
        audit: await testDb().auditLog.findMany({
          where: { entityId: { in: [f.draft.resultId, f.draft.id] } },
          orderBy: { id: 'asc' },
        }),
      });
      for (const state of ['DRAFT', 'UNDER_REVIEW', 'APPROVED']) {
        if (state === 'UNDER_REVIEW') {
          await maker
            .post('draft-results', {
              ...f.body,
              expectedVersion: 1,
              marks: { ...f.body.marks, externalMarks: '70' },
            })
            .expect(201);
          await maker
            .post(`result-review/${f.draft.resultId}/submit`, {
              requestId: randomUUID(),
              expectedVersion: 2,
              confirmed: true,
            })
            .expect(200);
        }
        if (state === 'APPROVED') {
          // Existing Phase 10D synthetic-policy pattern; never enables publication.
          vi.spyOn(app.get(ResultReviewService), 'policy').mockReturnValue({
            ...RESULT_REVIEW_POLICY,
            approvalEnabled: true,
            approvalBlockers: [],
          });
          await checker
            .post(`result-review/${f.draft.resultId}/approve`, {
              requestId: randomUUID(),
              expectedVersion: 3,
              confirmed: true,
            })
            .expect(200);
        }
        const before = JSON.stringify(await snapshot());
        const responses = [];
        for (const agent of [f.agent, other.agent]) {
          const list = await agent.get('/api/v1/student/results').expect(200);
          expect(list.body).toEqual(empty);
          for (const id of [f.draft.resultId, randomUUID()]) {
            const response = await agent.get('/api/v1/student/results/' + id).expect(404);
            expect(response.headers['cache-control']).toBe('no-store');
            const parsed = errorResponseSchema.parse(response.body);
            responses.push({ code: parsed.error.code, message: parsed.error.message });
          }
          await agent
            .get(`/api/v1/result-review/${f.draft.resultId}/versions/${randomUUID()}`)
            .expect(401);
        }
        expect(new Set(responses.map((x) => JSON.stringify(x))).size).toBe(1);
        expect(JSON.stringify(await snapshot())).toBe(before);
      }
    },
  );
  it('does not query legacy result or review data to guess release eligibility', async () => {
    const { agent } = await activatedStudent(app, registrar);
    const db = app.get(PrismaService).client;
    const reads = [
      vi.spyOn(db.result, 'findMany'),
      vi.spyOn(db.result, 'findUnique'),
      vi.spyOn(db.resultReviewEvent, 'findMany'),
    ];
    try {
      await agent.get('/api/v1/student/results').expect(200);
      await agent.get('/api/v1/student/results/' + randomUUID()).expect(404);
      for (const read of reads) expect(read).not.toHaveBeenCalled();
    } finally {
      for (const read of reads) read.mockRestore();
    }
  });
});
