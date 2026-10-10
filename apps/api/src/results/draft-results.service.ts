import { createHash } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@docversity/database';
import {
  columnLetter,
  componentConfigurationFromCurriculum,
  validateResultRows,
  type RawRowData,
  type ResultProgramSubject,
} from '@docversity/imports';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  DRAFT_MARK_FIELDS,
  ERROR_CODES,
  RESULT_IMPORT_FIELD_KEYS,
  normalizeRegistrationNumber,
  normalizeImportValue,
  draftImportOutcomeSchema,
  type CommitDraftImport,
  type DraftImportPlan,
  type DraftIssue,
  type DraftLookup,
  type DraftLookupResponse,
  type DraftMarks,
  type ResultPreviewContext,
  type SaveDraft,
  type SavedDraft,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { AppError, Errors } from '../common/app-error.js';
import { PrismaService } from '../database/prisma.service.js';
import { ResultImportsService } from '../result-imports/result-imports.service.js';
import { ResultPreviewStore } from '../result-imports/result-preview.store.js';

const include = {
  result: { include: { studentRegistration: { include: { student: true } }, examination: true } },
  programSubject: { include: { subject: true } },
} as const;
type Item = Prisma.ResultItemGetPayload<{ include: typeof include }>;
const conflict = (message: string) =>
  new AppError(HttpStatus.CONFLICT, ERROR_CODES.conflict, message);
const fieldKeys = {
  internalMarks: 'internal',
  externalMarks: 'external',
  practicalMarks: 'practical',
  otherMarks: 'other',
} as const;
const missingCodes = new Set(['REQUIRED_COMPONENT_MISSING', 'NO_MARKS']);
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const marksOf = (item: Item): DraftMarks =>
  Object.fromEntries(DRAFT_MARK_FIELDS.map((f) => [f, item[f]?.toString() ?? null])) as DraftMarks;
const sameMarks = (a: DraftMarks, b: DraftMarks) =>
  DRAFT_MARK_FIELDS.every((f) =>
    a[f] === null ? b[f] === null : b[f] !== null && Number(a[f]) === Number(b[f]),
  );

@Injectable()
export class DraftResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly imports: ResultImportsService,
    private readonly store: ResultPreviewStore,
  ) {}

  private async transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.client.$transaction(work, {
          isolationLevel: 'Serializable',
          timeout: 60_000,
        });
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === 'P2034' && attempt < 2) continue;
        if (code === 'P2034' || code === 'P2002')
          throw conflict(
            'The records changed during this save. Reload and review before trying again.',
          );
        throw error;
      }
    }
    throw conflict('Please reload and retry.');
  }

  private async context(
    tx: Prisma.TransactionClient,
    context: ResultPreviewContext,
    registrationId: string,
    programSubjectId: string,
    applicationId: string | null,
  ) {
    const resolved = await this.imports.resolveContext(context, true, tx);
    const registration = await tx.studentRegistration.findUnique({
      where: { id: registrationId },
      include: { student: true },
    });
    if (
      registration?.status !== 'ACTIVE' ||
      registration.programId !== context.programId ||
      registration.curriculumId !== context.curriculumId
    )
      throw Errors.validation([
        {
          path: 'registrationId',
          message: 'Choose an active student enrolled in this exact course and curriculum.',
        },
      ]);
    const subject = resolved.programSubjects.find(
      (s) => s.id === programSubjectId && s.academicPeriod === String(context.periodNumber),
    );
    if (!subject)
      throw Errors.validation([
        { path: 'programSubjectId', message: 'Choose a subject assigned to this semester/year.' },
      ]);
    let attemptNumber = 1;
    if (resolved.exam.kind === 'RE_EXAMINATION') {
      const app = applicationId
        ? await tx.reExamApplication.findUnique({ where: { id: applicationId } })
        : null;
      if (
        app?.status !== 'APPROVED' ||
        app.studentRegistrationId !== registration.id ||
        app.examinationId !== resolved.exam.id ||
        app.programSubjectId !== subject.id
      )
        throw Errors.validation([
          {
            path: 'reExamApplicationId',
            message:
              'An approved re-exam application for this student, examination and subject is required.',
          },
        ]);
      attemptNumber = app.attemptNumber;
    } else if (applicationId)
      throw Errors.validation([
        {
          path: 'reExamApplicationId',
          message: 'Regular examinations do not use a re-exam application.',
        },
      ]);
    return { resolved, registration, subject, attemptNumber, applicationId };
  }

  private assess(
    subject: ResultProgramSubject,
    registration: { id: string; registrationNumberNormalized: string; curriculumId: string | null },
    context: ResultPreviewContext,
    marks: DraftMarks,
  ) {
    const rawData: RawRowData = {
      A: { type: 'string', value: registration.registrationNumberNormalized },
      B: { type: 'string', value: subject.subjectCode },
    };
    const mapping = Object.fromEntries(RESULT_IMPORT_FIELD_KEYS.map((f) => [f, null])) as Record<
      (typeof RESULT_IMPORT_FIELD_KEYS)[number],
      string | null
    >;
    mapping.registrationNumber = 'A';
    mapping.subjectCode = 'B';
    for (const [i, field] of DRAFT_MARK_FIELDS.entries()) {
      const col = columnLetter(i + 3);
      mapping[field] = col;
      const value = marks[field];
      if (value !== null) rawData[col] = { type: 'string', value };
    }
    const outcome = validateResultRows([{ rowNumber: 1, rawData }], mapping, {
      academicPeriod: String(context.periodNumber),
      expectedCurriculumId: context.curriculumId,
      gradesAccepted: false,
      registrations: new Map([[registration.registrationNumberNormalized, registration]]),
      curriculumSubjects: new Map([[context.curriculumId, [subject]]]),
    })[0];
    const issues: DraftIssue[] = (outcome?.errors ?? []).map((e) => ({
      field: e.field ?? null,
      code: e.code,
      message: e.message,
    }));
    for (const field of DRAFT_MARK_FIELDS) {
      const max =
        field === 'totalMarks'
          ? subject.maxMarks
          : subject.componentConfiguration?.[`${fieldKeys[field]}Max`];
      if (marks[field] !== null && (max === null || max === undefined))
        issues.push({
          field,
          code: 'UNCONFIGURED_COMPONENT',
          message: `${field} has no configured maximum. Configure it before entering marks.`,
        });
    }
    return issues;
  }

  private present(item: Item): SavedDraft {
    const context = {
      programId: item.result.examination.programId,
      curriculumId: item.programSubject.curriculumId,
      academicSessionId: item.result.examination.academicSessionId,
      periodNumber: item.result.examination.semesterNumber,
      examinationId: item.result.examinationId,
    };
    const config = componentConfigurationFromCurriculum(item.programSubject.componentConfiguration);
    const subject: ResultProgramSubject = {
      id: item.programSubjectId,
      curriculumId: context.curriculumId,
      subjectCode: item.programSubject.subject.code,
      academicPeriod: String(item.programSubject.semesterNumber),
      maxMarks: item.programSubject.maxMarks?.toNumber() ?? null,
      componentConfiguration: config.configuration,
    };
    return {
      context,
      id: item.id,
      resultId: item.resultId,
      version: item.result.version,
      registrationId: item.result.studentRegistrationId,
      registrationNumber: item.result.studentRegistration.registrationNumber,
      studentName: item.result.studentRegistration.student.fullName,
      examinationId: item.result.examinationId,
      examinationName: item.result.examination.name,
      programSubjectId: item.programSubjectId,
      subjectCode: item.programSubject.subject.code,
      subjectName: item.programSubject.subject.name,
      attemptNumber: item.result.attemptNumber,
      reExamApplicationId: item.reExamApplicationId,
      marks: marksOf(item),
      status: 'DRAFT',
      updatedAt: item.updatedAt.toISOString(),
      issues: this.assess(subject, item.result.studentRegistration, context, marksOf(item)),
    };
  }

  async list(examinationId?: string) {
    const items = await this.prisma.client.resultItem.findMany({
      where: {
        result: {
          publicationStatus: 'DRAFT',
          publishedAt: null,
          ...(examinationId ? { examinationId } : {}),
        },
      },
      include,
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    return { items: items.map((i) => this.present(i)) };
  }
  async get(id: string) {
    const item = await this.prisma.client.resultItem.findUnique({ where: { id }, include });
    if (item?.result.publicationStatus !== 'DRAFT' || item.result.publishedAt)
      throw Errors.notFound();
    return this.present(item);
  }
  async history(id: string) {
    await this.get(id);
    const logs = await this.prisma.client.auditLog.findMany({
      where: {
        entityType: 'ResultItem',
        entityId: id,
        action: { in: [AUDIT_ACTIONS.resultDraftCreated, AUDIT_ACTIONS.resultDraftUpdated] },
      },
      include: { actor: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      items: logs.map((l) => ({
        id: l.id,
        actorUserId: l.actorUserId,
        actorName: l.actor?.displayName ?? null,
        action: l.action,
        createdAt: l.createdAt.toISOString(),
        metadata: l.metadata,
      })),
    };
  }

  async lookup(input: DraftLookup): Promise<DraftLookupResponse> {
    const resolved = await this.imports.resolveContext(input);
    const registration = await this.prisma.client.studentRegistration.findFirst({
      where: {
        programId: input.programId,
        curriculumId: input.curriculumId,
        registrationNumberNormalized: normalizeRegistrationNumber(input.registrationNumber),
        status: 'ACTIVE',
      },
      include: { student: true },
    });
    if (!registration) throw Errors.notFound();
    const applications =
      resolved.exam.kind === 'RE_EXAMINATION'
        ? await this.prisma.client.reExamApplication.findMany({
            where: {
              studentRegistrationId: registration.id,
              examinationId: input.examinationId,
              status: 'APPROVED',
            },
          })
        : [];
    const subjects = [];
    for (const subject of resolved.programSubjects.filter(
      (s) => s.academicPeriod === String(input.periodNumber),
    )) {
      const application = applications.find((a) => a.programSubjectId === subject.id);
      if (resolved.exam.kind === 'RE_EXAMINATION' && !application) continue;
      const attemptNumber = application?.attemptNumber ?? 1;
      const existing = await this.prisma.client.resultItem.findFirst({
        where: {
          programSubjectId: subject.id,
          result: {
            studentRegistrationId: registration.id,
            examinationId: input.examinationId,
            attemptNumber,
          },
        },
        include,
      });
      if (
        existing &&
        (existing.result.publicationStatus !== 'DRAFT' || existing.result.publishedAt)
      )
        continue;
      const source = await this.prisma.client.programSubject.findUniqueOrThrow({
        where: { id: subject.id },
      });
      const translated = componentConfigurationFromCurriculum(source.componentConfiguration);
      const components = DRAFT_MARK_FIELDS.flatMap((field) => {
        const max =
          field === 'totalMarks'
            ? subject.maxMarks
            : subject.componentConfiguration?.[`${fieldKeys[field]}Max`];
        return max === null || max === undefined
          ? []
          : [
              {
                field,
                max,
                required:
                  field !== 'totalMarks' &&
                  subject.componentConfiguration?.[`${fieldKeys[field]}Required`] === true,
              },
            ];
      });
      subjects.push({
        id: subject.id,
        code: subject.subjectCode,
        name: subject.subjectName ?? subject.subjectCode,
        maxMarks: subject.maxMarks,
        components,
        configurationIssue: translated.unrecognized.length
          ? `Unrecognized assessment components: ${translated.unrecognized.join(', ')}`
          : components.length === 0
            ? 'No marks maxima have been configured.'
            : null,
        attemptNumber,
        reExamApplicationId: application?.id ?? null,
        draft: existing ? this.present(existing) : null,
      });
    }
    return {
      registrationId: registration.id,
      registrationNumber: registration.registrationNumber,
      studentName: registration.student.fullName,
      examinationKind: resolved.exam.kind,
      subjects,
    };
  }

  private async write(
    tx: Prisma.TransactionClient,
    body: SaveDraft,
    actorUserId: string,
    batchId: string | null = null,
  ) {
    const c = await this.context(
      tx,
      body.context,
      body.registrationId,
      body.programSubjectId,
      body.reExamApplicationId,
    );
    const assigned = await tx.programSubject.findUniqueOrThrow({
      where: { id: body.programSubjectId },
    });
    const translated = componentConfigurationFromCurriculum(assigned.componentConfiguration);
    if (translated.unrecognized.length)
      throw Errors.validation([
        { path: 'marks', message: 'Assessment components must be configured before saving marks.' },
      ]);
    const issues = this.assess(c.subject, c.registration, body.context, body.marks);
    const blocking = issues.filter((i) => !missingCodes.has(i.code));
    if (blocking.length)
      throw Errors.validation(
        blocking.map((i) => ({ path: `marks.${i.field ?? ''}`, message: i.message })),
      );
    const results = await tx.result.findMany({
      where: {
        studentRegistrationId: body.registrationId,
        examinationId: body.context.examinationId,
        attemptNumber: c.attemptNumber,
      },
      orderBy: { id: 'asc' },
      include: { items: true },
    });
    if (results.some((r) => r.publicationStatus !== 'DRAFT' || r.publishedAt))
      throw conflict(
        'This examination attempt has a locked or published result. It cannot be changed here.',
      );
    let result = results[0];
    const old = result?.items.find((i) => i.programSubjectId === body.programSubjectId);
    if (old && body.expectedVersion === null)
      throw conflict('A draft already exists. Open it and review before editing.');
    if (body.expectedVersion !== null && (!old || result?.version !== body.expectedVersion))
      throw conflict('This draft changed since you opened it. Reload before saving.');
    if (result) {
      const changed = await tx.result.updateMany({
        where: {
          id: result.id,
          version: result.version,
          publicationStatus: 'DRAFT',
          publishedAt: null,
        },
        // Editing marks invalidates any legacy draft calculations; this phase computes none.
        data: {
          version: { increment: 1 },
          totalMarks: null,
          maxMarks: null,
          sgpa: null,
          cgpa: null,
          outcome: null,
          gradingSchemeId: null,
          calculationSnapshot: Prisma.DbNull,
          approvedAt: null,
        },
      });
      if (changed.count !== 1) throw conflict('Another staff member changed this draft. Reload.');
    } else {
      const created = await tx.result.create({
        data: {
          studentRegistrationId: body.registrationId,
          examinationId: body.context.examinationId,
          attemptNumber: c.attemptNumber,
        },
      });
      result = { ...created, items: [] };
    }
    const data = {
      ...body.marks,
      maxMarks: c.subject.maxMarks,
      status: null,
      grade: null,
      gradePoint: null,
      creditsAttempted: null,
      creditsEarned: null,
      reExamApplicationId: body.reExamApplicationId,
      sourceData: {
        source: batchId ? 'EXCEL_DRAFT' : 'MANUAL_DRAFT',
        batchId,
        componentConfiguration: translated.configuration ?? {},
        maximumMarks: c.subject.maxMarks,
      },
    };
    const saved = old
      ? await tx.resultItem.update({ where: { id: old.id }, data, include })
      : await tx.resultItem.create({
          data: { ...data, resultId: result.id, programSubjectId: body.programSubjectId },
          include,
        });
    await this.audit.writeAuditEvent(
      {
        actorUserId,
        action: old ? AUDIT_ACTIONS.resultDraftUpdated : AUDIT_ACTIONS.resultDraftCreated,
        entityType: 'ResultItem',
        entityId: saved.id,
        metadata: {
          examinationId: body.context.examinationId,
          registrationId: body.registrationId,
          programSubjectId: body.programSubjectId,
          attemptNumber: c.attemptNumber,
          reExamApplicationId: body.reExamApplicationId,
          batchId,
          previous: old
            ? Object.fromEntries(DRAFT_MARK_FIELDS.map((f) => [f, old[f]?.toString() ?? null]))
            : null,
          next: body.marks,
          previousDerived: results[0]
            ? {
                totalMarks: results[0].totalMarks?.toString() ?? null,
                maxMarks: results[0].maxMarks?.toString() ?? null,
                sgpa: results[0].sgpa?.toString() ?? null,
                cgpa: results[0].cgpa?.toString() ?? null,
                outcome: results[0].outcome,
                gradingSchemeId: results[0].gradingSchemeId,
                calculationSnapshotHash: results[0].calculationSnapshot
                  ? digest(results[0].calculationSnapshot)
                  : null,
              }
            : null,
          previousSubjectOutcome: old
            ? {
                status: old.status,
                grade: old.grade,
                gradePoint: old.gradePoint?.toString() ?? null,
                creditsAttempted: old.creditsAttempted?.toString() ?? null,
                creditsEarned: old.creditsEarned?.toString() ?? null,
              }
            : null,
          derivedCalculationsCleared: true,
          previousVersion: old ? body.expectedVersion : null,
          version: saved.result.version,
        },
      },
      tx,
    );
    return this.present(saved);
  }
  async save(body: SaveDraft, actorUserId: string) {
    return this.transaction((tx) => this.write(tx, body, actorUserId));
  }

  private async prepare(id: string, actor: string, tx: Prisma.TransactionClient) {
    const meta = await this.store.meta(id, actor);
    if (!meta) throw Errors.notFound();
    if (!meta.mapping) throw conflict('Map and validate the workbook before saving drafts.');
    const resolved = await this.imports.resolveContext(meta.context, true, tx);
    const sheet = (await this.store.source(id))?.[meta.mapping.worksheet];
    if (!sheet) throw Errors.notFound();
    const mapping = Object.fromEntries(
      RESULT_IMPORT_FIELD_KEYS.map((f) => [
        f,
        meta.mapping?.columns[f] ? columnLetter(meta.mapping.columns[f]) : null,
      ]),
    ) as Record<(typeof RESULT_IMPORT_FIELD_KEYS)[number], string | null>;
    const raw = sheet.map((row) => ({
      rowNumber: row.rowNumber,
      rawData: Object.fromEntries<RawRowData[string]>(
        row.cells.map((cell, i) => [columnLetter(i + 1), cell]),
      ),
    }));
    const numbers = raw.flatMap((row) => {
      const col = mapping.registrationNumber;
      const cell = col ? row.rawData[col] : undefined;
      return cell?.type === 'string'
        ? [normalizeRegistrationNumber(normalizeImportValue(cell.value))]
        : [];
    });
    const registrations = await tx.studentRegistration.findMany({
      where: { programId: meta.context.programId, registrationNumberNormalized: { in: numbers } },
      include: { student: true },
    });
    const outcomes = validateResultRows(raw, mapping, {
      academicPeriod: String(meta.context.periodNumber),
      expectedCurriculumId: meta.context.curriculumId,
      gradesAccepted: false,
      registrations: new Map(registrations.map((r) => [r.registrationNumberNormalized, r])),
      curriculumSubjects: new Map([[meta.context.curriculumId, resolved.programSubjects]]),
    });
    // Reject every occurrence: a conflicting duplicate must not make the first row authoritative.
    const duplicates = new Set(
      outcomes
        .filter((r) => r.errors.some((e) => e.code === 'DUPLICATE_ROW'))
        .map((r) => `${r.registrationId}:${r.normalizedData.programSubjectId}`),
    );
    for (const row of outcomes)
      if (
        duplicates.has(`${row.registrationId}:${row.normalizedData.programSubjectId}`) &&
        !row.errors.some((e) => e.code === 'DUPLICATE_ROW')
      )
        row.errors.push({
          severity: 'error',
          field: 'subjectCode',
          code: 'DUPLICATE_ROW',
          message: 'Duplicate student/subject rows require correction before saving.',
        });
    const rows: DraftImportPlan['rows'] = [];
    const writes: { rowNumber: number; body: SaveDraft }[] = [];
    const state: unknown[] = [];
    for (const outcome of outcomes) {
      const issues: DraftIssue[] = outcome.errors.map((e) => ({
        field: e.field ?? null,
        code: e.code,
        message: e.message,
      }));
      let action: 'CREATE' | 'SKIP' | 'REJECT' = 'REJECT';
      let resultItemId: string | null = null;
      const registration = registrations.find((r) => r.id === outcome.registrationId);
      const subjectId = outcome.normalizedData.programSubjectId;
      const marks = Object.fromEntries(
        DRAFT_MARK_FIELDS.map((f) => [f, outcome.normalizedData.values[f] ?? null]),
      ) as DraftMarks;
      if (!issues.length && registration && subjectId) {
        const application =
          resolved.exam.kind === 'RE_EXAMINATION'
            ? await tx.reExamApplication.findFirst({
                where: {
                  studentRegistrationId: registration.id,
                  examinationId: resolved.exam.id,
                  programSubjectId: subjectId,
                  status: 'APPROVED',
                },
              })
            : null;
        const body: SaveDraft = {
          context: meta.context,
          registrationId: registration.id,
          programSubjectId: subjectId,
          reExamApplicationId: application?.id ?? null,
          expectedVersion: null,
          marks,
        };
        try {
          const c = await this.context(
            tx,
            body.context,
            body.registrationId,
            body.programSubjectId,
            body.reExamApplicationId,
          );
          const assigned = await tx.programSubject.findUniqueOrThrow({ where: { id: subjectId } });
          if (
            componentConfigurationFromCurriculum(assigned.componentConfiguration).unrecognized
              .length
          )
            issues.push({
              field: null,
              code: 'UNCONFIGURED_COMPONENT',
              message: 'Assessment configuration needs review.',
            });
          issues.push(...this.assess(c.subject, c.registration, meta.context, marks));
          const results = await tx.result.findMany({
            where: {
              studentRegistrationId: registration.id,
              examinationId: resolved.exam.id,
              attemptNumber: c.attemptNumber,
            },
            orderBy: { id: 'asc' },
          });
          state.push(
            results.map((r) => ({
              id: r.id,
              version: r.version,
              status: r.publicationStatus,
              publishedAt: r.publishedAt,
            })),
          );
          const item = await tx.resultItem.findFirst({
            where: {
              programSubjectId: subjectId,
              result: {
                studentRegistrationId: registration.id,
                examinationId: resolved.exam.id,
                attemptNumber: c.attemptNumber,
              },
            },
            include,
          });
          resultItemId = item?.id ?? null;
          if (results.some((r) => r.publicationStatus !== 'DRAFT' || r.publishedAt))
            issues.push({
              field: null,
              code: 'LOCKED_RESULT',
              message: 'A locked or published result exists for this attempt.',
            });
          if (!issues.length) {
            if (item) {
              if (
                sameMarks(marksOf(item), marks) &&
                item.reExamApplicationId === body.reExamApplicationId
              )
                action = 'SKIP';
              else
                issues.push({
                  field: null,
                  code: 'DRAFT_CONFLICT',
                  message: 'Different marks already exist. Open and edit the draft manually.',
                });
            } else {
              action = 'CREATE';
              writes.push({ rowNumber: outcome.rowNumber, body });
            }
          }
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          issues.push(
            ...(error.options.details ?? [{ path: 'context', message: error.message }]).map(
              (e) => ({ field: e.path, code: 'INELIGIBLE_CONTEXT', message: e.message }),
            ),
          );
        }
      }
      rows.push({
        rowNumber: outcome.rowNumber,
        action,
        message:
          action === 'CREATE'
            ? 'Create draft'
            : action === 'SKIP'
              ? 'Identical marks already saved'
              : issues.map((i) => i.message).join(' '),
        resultItemId,
        issues,
      });
    }
    const counts = {
      created: rows.filter((r) => r.action === 'CREATE').length,
      updated: 0 as const,
      skipped: rows.filter((r) => r.action === 'SKIP').length,
      rejected: rows.filter((r) => r.action === 'REJECT').length,
    };
    const plan: DraftImportPlan = {
      digest: digest({
        file: meta.fileSha256,
        context: meta.context,
        mapping: meta.mapping,
        rows,
        marks: writes,
        state,
      }),
      expiresAt: new Date(meta.expiresAt).toISOString(),
      counts,
      rows,
    };
    return { plan, writes, meta };
  }
  async plan(id: string, actor: string) {
    return this.transaction(async (tx) => (await this.prepare(id, actor, tx)).plan);
  }
  async commit(id: string, actor: string, request: CommitDraftImport) {
    return this.transaction(async (tx) => {
      const meta = await this.store.meta(id, actor);
      if (!meta) throw Errors.notFound();
      const requestDigest = digest({ id, actor, digest: request.digest });
      const receipt = await tx.resultDraftBatch.findUnique({ where: { id: request.batchId } });
      if (receipt) {
        if (
          receipt.actorUserId !== actor ||
          receipt.previewId !== id ||
          receipt.requestDigest !== requestDigest
        )
          throw conflict('This batch identifier was already used for another request.');
        return draftImportOutcomeSchema.parse(receipt.outcome);
      }
      const { plan, writes } = await this.prepare(id, actor, tx);
      if (plan.digest !== request.digest)
        throw conflict(
          'The workbook or academic records changed. Review a fresh draft plan before confirming.',
        );
      if (plan.counts.created + plan.counts.skipped === 0)
        throw conflict(
          'No eligible rows can be saved. Correct the workbook and review a new plan.',
        );
      for (const row of writes) {
        const saved = await this.write(tx, row.body, actor, request.batchId);
        const outcome = plan.rows.find((r) => r.rowNumber === row.rowNumber);
        if (outcome) outcome.resultItemId = saved.id;
      }
      const finalMeta = await this.store.meta(id, actor);
      if (
        !finalMeta ||
        Date.now() >= meta.expiresAt ||
        digest(finalMeta.mapping) !== digest(meta.mapping)
      )
        throw conflict(
          'The preview expired or was discarded during this save. No drafts were saved.',
        );
      const outcome = { ...plan, batchId: request.batchId };
      await tx.resultDraftBatch.create({
        data: {
          id: request.batchId,
          actorUserId: actor,
          previewId: id,
          examinationId: meta.context.examinationId,
          requestDigest,
          outcome,
        },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId: actor,
          action: AUDIT_ACTIONS.resultDraftBatchSaved,
          entityType: 'ResultDraftBatch',
          entityId: request.batchId,
          metadata: { previewId: id, examinationId: meta.context.examinationId, ...plan.counts },
        },
        tx,
      );
      return outcome;
    });
  }
}
