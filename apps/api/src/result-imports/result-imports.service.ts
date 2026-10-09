import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  buildResultErrorReport,
  buildResultTemplate,
  columnLetter,
  componentConfigurationFromCurriculum,
  describeResultWorksheets,
  ImportFileError,
  loadWorkbook,
  type RawRowData,
  readWorksheetRows,
  type ResultExistingRegistration,
  type ResultProgramSubject,
  sanitizeFilename,
  uuidv7,
  validateResultMapping,
  validateResultRows,
  verifyXlsxContainer,
} from '@docversity/imports';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  ERROR_CODES,
  normalizeImportValue,
  normalizeRegistrationNumber,
  periodLabel,
  RESULT_IMPORT_FIELD_KEYS,
  type ResultComponent,
  type ResultContextBlocker,
  type ResultImportContextOptions,
  type ResultImportField,
  type ResultPreview,
  type ResultPreviewContext,
  type ResultPreviewMapping,
  type ResultPreviewRowList,
  type ResultPreviewRowQuery,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { AppError, Errors } from '../common/app-error.js';
import { paginationMeta } from '../common/pagination.js';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import { PrismaService } from '../database/prisma.service.js';
import type { UploadedWorkbook } from '../imports/upload.interceptor.js';
import {
  MAX_OPEN_PREVIEWS_PER_USER,
  type PreviewMeta,
  type PreviewOutcomeRow,
  type PreviewSource,
  RESULT_PREVIEW_TTL_MS,
  ResultPreviewStore,
} from './result-preview.store.js';

export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ACCEPTED_MIME_TYPES = new Set([
  XLSX_CONTENT_TYPE,
  'application/octet-stream',
  'application/zip',
  '',
]);
const MB = 1024 * 1024;

/** Examination statuses whose results may be previewed (DRAFT is not final, PUBLISHED/ARCHIVED are closed). */
const PREVIEWABLE_EXAM_STATUSES = new Set(['OPEN', 'UNDER_REVIEW']);

const COMPONENT_FIELDS = [
  'internalMarks',
  'externalMarks',
  'practicalMarks',
  'otherMarks',
] as const;
const COMPONENT_KEYS = {
  internalMarks: 'internal',
  externalMarks: 'external',
  practicalMarks: 'practical',
  otherMarks: 'other',
} as const;

const BLOCKER_MESSAGES: Record<ResultContextBlocker, string> = {
  EXAMINATION_DRAFT: 'This examination is still a draft. Open it in Examinations first.',
  EXAMINATION_PUBLISHED: 'Results of this examination are already published.',
  EXAMINATION_ARCHIVED: 'This examination is archived.',
  CURRICULUM_DRAFT: 'The curriculum version is still a draft.',
  PERIOD_HAS_NO_SUBJECTS:
    'The curriculum has no subjects in this semester/year. Add them in Course Management first.',
};

export interface DownloadFile {
  filename: string;
  bytes: Uint8Array;
}

function blockerFor(
  exam: { status: string },
  curriculumStatus: string,
  subjectCount: number,
): ResultContextBlocker | null {
  if (exam.status === 'DRAFT') return 'EXAMINATION_DRAFT';
  if (exam.status === 'PUBLISHED') return 'EXAMINATION_PUBLISHED';
  if (!PREVIEWABLE_EXAM_STATUSES.has(exam.status)) return 'EXAMINATION_ARCHIVED';
  if (curriculumStatus === 'DRAFT') return 'CURRICULUM_DRAFT';
  if (subjectCount === 0) return 'PERIOD_HAS_NO_SUBJECTS';
  return null;
}

function decimal(value: { toNumber(): number } | null): number | null {
  return value === null ? null : value.toNumber();
}

/**
 * Results import PREVIEW (Phase 10B). Reads an uploaded workbook in the API (bounded by the same
 * size/row/column limits as student imports), validates rows against server-side academic context
 * with the Phase 10A validator and keeps the outcome temporarily in Redis for its uploader.
 *
 * This service deliberately has no code path that writes results, result items, registrations,
 * certificates or payments: its only database writes are audit entries.
 */
@Injectable()
export class ResultImportsService {
  private template: Uint8Array | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly store: ResultPreviewStore,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  async resultTemplate(): Promise<DownloadFile> {
    this.template ??= await buildResultTemplate();
    return { filename: 'docversity-results-import-template.xlsx', bytes: this.template };
  }

  // ------------------------------------------------------------------------------------------
  // Academic context
  // ------------------------------------------------------------------------------------------

  /** Examinations that can be chosen, grouped by course and curriculum version (read only). */
  async contextOptions(): Promise<ResultImportContextOptions> {
    const exams = await this.prisma.client.examination.findMany({
      where: { curriculumId: { not: null } },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        code: true,
        name: true,
        kind: true,
        status: true,
        examSession: true,
        semesterNumber: true,
        academicSession: { select: { id: true, code: true, name: true } },
        program: { select: { id: true, code: true, name: true } },
        curriculum: {
          select: {
            id: true,
            versionCode: true,
            name: true,
            status: true,
            structureType: true,
            numberOfPeriods: true,
            subjects: { select: { semesterNumber: true } },
          },
        },
      },
    });

    const programs = new Map<string, ResultImportContextOptions['programs'][number]>();
    for (const exam of exams) {
      const curriculum = exam.curriculum;
      if (!curriculum) continue;
      let program = programs.get(exam.program.id);
      if (!program) {
        program = { ...exam.program, curricula: [] };
        programs.set(exam.program.id, program);
      }
      let version = program.curricula.find((candidate) => candidate.id === curriculum.id);
      if (!version) {
        const counts = new Map<number, number>();
        for (const subject of curriculum.subjects) {
          counts.set(subject.semesterNumber, (counts.get(subject.semesterNumber) ?? 0) + 1);
        }
        const numbers = [
          ...new Set([
            ...Array.from({ length: curriculum.numberOfPeriods }, (_, index) => index + 1),
            ...counts.keys(),
          ]),
        ].sort((a, b) => a - b);
        version = {
          id: curriculum.id,
          versionCode: curriculum.versionCode,
          name: curriculum.name,
          status: curriculum.status,
          structureType: curriculum.structureType,
          periods: numbers.map((number) => ({
            number,
            label: periodLabel(curriculum.structureType, number),
            subjectCount: counts.get(number) ?? 0,
          })),
          examinations: [],
        };
        program.curricula.push(version);
      }
      const subjectCount =
        version.periods.find((period) => period.number === exam.semesterNumber)?.subjectCount ?? 0;
      version.examinations.push({
        id: exam.id,
        code: exam.code,
        name: exam.name,
        kind: exam.kind,
        status: exam.status,
        examSession: exam.examSession,
        academicSession: exam.academicSession,
        period: {
          number: exam.semesterNumber,
          label: periodLabel(curriculum.structureType, exam.semesterNumber),
        },
        blocker: blockerFor(exam, curriculum.status, subjectCount),
      });
    }
    return {
      programs: [...programs.values()].sort((a, b) => a.code.localeCompare(b.code)),
    };
  }

  /**
   * Re-reads the examination and proves that the submitted course, curriculum, session and
   * semester/year are exactly its own. Client-provided identifiers are never trusted on their own.
   */
  private async resolveContext(context: ResultPreviewContext, enforceBlockers = true) {
    const exam = await this.prisma.client.examination.findUnique({
      where: { id: context.examinationId },
      select: {
        id: true,
        code: true,
        name: true,
        kind: true,
        status: true,
        examSession: true,
        semesterNumber: true,
        programId: true,
        academicSessionId: true,
        curriculumId: true,
        program: { select: { id: true, code: true, name: true } },
        academicSession: { select: { id: true, code: true, name: true } },
        curriculum: {
          select: {
            id: true,
            versionCode: true,
            name: true,
            status: true,
            structureType: true,
          },
        },
      },
    });
    if (!exam?.curriculum) {
      throw Errors.validation([
        { path: 'examinationId', message: 'Choose an examination from the list.' },
      ]);
    }
    const mismatches: { path: keyof ResultPreviewContext; message: string }[] = [];
    if (exam.programId !== context.programId) {
      mismatches.push({ path: 'programId', message: 'The examination belongs to another course.' });
    }
    if (exam.curriculumId !== context.curriculumId) {
      mismatches.push({
        path: 'curriculumId',
        message: 'The examination belongs to another curriculum version.',
      });
    }
    if (exam.academicSessionId !== context.academicSessionId) {
      mismatches.push({
        path: 'academicSessionId',
        message: 'The examination belongs to another academic session.',
      });
    }
    if (exam.semesterNumber !== context.periodNumber) {
      mismatches.push({
        path: 'periodNumber',
        message: 'The examination belongs to another semester/year.',
      });
    }
    if (mismatches.length > 0) throw Errors.validation(mismatches);

    const curriculum = exam.curriculum;
    const subjects = await this.prisma.client.programSubject.findMany({
      where: { curriculumId: curriculum.id },
      orderBy: [{ semesterNumber: 'asc' }, { displayOrder: 'asc' }],
      select: {
        id: true,
        curriculumId: true,
        semesterNumber: true,
        maxMarks: true,
        componentConfiguration: true,
        subject: { select: { code: true, name: true } },
      },
    });
    const periodSubjects = subjects.filter(
      (subject) => subject.semesterNumber === exam.semesterNumber,
    );
    const blocker = blockerFor(exam, curriculum.status, periodSubjects.length);
    if (blocker && enforceBlockers) {
      throw new AppError(HttpStatus.CONFLICT, ERROR_CODES.conflict, BLOCKER_MESSAGES[blocker], {
        details: [{ path: 'examinationId', message: BLOCKER_MESSAGES[blocker] }],
      });
    }

    const unrecognized = new Set<string>();
    const programSubjects: ResultProgramSubject[] = subjects.map((subject) => {
      const translated = componentConfigurationFromCurriculum(subject.componentConfiguration);
      if (subject.semesterNumber === exam.semesterNumber) {
        for (const name of translated.unrecognized) unrecognized.add(name);
      }
      return {
        id: subject.id,
        curriculumId: subject.curriculumId,
        subjectCode: subject.subject.code,
        subjectName: subject.subject.name,
        academicPeriod: String(subject.semesterNumber),
        maxMarks: decimal(subject.maxMarks),
        componentConfiguration: translated.configuration,
      };
    });
    const components: ResultComponent[] = COMPONENT_FIELDS.map((field) => {
      const key = COMPONENT_KEYS[field];
      const configs = programSubjects
        .filter((subject) => subject.academicPeriod === String(exam.semesterNumber))
        .map((subject) => subject.componentConfiguration ?? {});
      return {
        field,
        configured: configs.some((config) => typeof config[`${key}Max`] === 'number'),
        required: configs.some((config) => config[`${key}Required`] === true),
      };
    });

    return {
      exam,
      curriculum,
      programSubjects,
      periodSubjectCount: periodSubjects.length,
      components,
      unrecognizedComponents: [...unrecognized].sort(),
      requiredFields: components
        .filter((component) => component.required)
        .map((component) => component.field) as ResultImportField[],
    };
  }

  // ------------------------------------------------------------------------------------------
  // Preview lifecycle
  // ------------------------------------------------------------------------------------------

  private unsupported(message: string): AppError {
    return new AppError(HttpStatus.BAD_REQUEST, ERROR_CODES.unsupportedFile, message, {
      details: [{ path: 'file', message }],
    });
  }

  private async requireMeta(id: string, userId: string): Promise<PreviewMeta> {
    const meta = await this.store.meta(id, userId);
    if (!meta) {
      throw new AppError(
        HttpStatus.NOT_FOUND,
        ERROR_CODES.notFound,
        'This preview does not exist or has expired. Upload the file again.',
      );
    }
    return meta;
  }

  async create(
    context: ResultPreviewContext,
    file: UploadedWorkbook | undefined,
    actorUserId: string,
  ): Promise<ResultPreview> {
    if (!file || file.size === 0) {
      throw Errors.validation([{ path: 'file', message: 'Choose an .xlsx file to upload.' }]);
    }
    const filename = sanitizeFilename(file.originalname);
    if (extname(filename).toLowerCase() !== '.xlsx') {
      throw this.unsupported(
        'Only .xlsx workbooks are accepted. Save the file as "Excel Workbook (.xlsx)".',
      );
    }
    if (!ACCEPTED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
      throw this.unsupported('This file type is not accepted. Upload an Excel workbook (.xlsx).');
    }
    // Context first: a wrong selection is reported before the file is read.
    const resolved = await this.resolveContext(context);
    if ((await this.store.openCount(actorUserId)) >= MAX_OPEN_PREVIEWS_PER_USER) {
      throw new AppError(
        HttpStatus.CONFLICT,
        ERROR_CODES.conflict,
        `You already have ${MAX_OPEN_PREVIEWS_PER_USER} open previews. Discard one or wait for it to expire.`,
      );
    }

    const bytes = new Uint8Array(
      file.buffer.buffer,
      file.buffer.byteOffset,
      file.buffer.byteLength,
    );
    const limits = {
      maxRows: this.config.IMPORT_MAX_ROWS,
      maxColumns: this.config.IMPORT_MAX_COLUMNS,
    };
    const source: PreviewSource = {};
    let sheets;
    try {
      // Proves the declared sizes by inflating every part with a hard cap before parsing.
      verifyXlsxContainer(bytes, {
        maxUncompressedBytes: this.config.IMPORT_MAX_UNCOMPRESSED_MB * MB,
      });
      const workbook = await loadWorkbook(bytes);
      sheets = describeResultWorksheets(workbook, limits);
      let sourceRows = 0;
      for (const sheet of sheets) {
        if (sheet.problem !== null) continue;
        sourceRows += sheet.rowCount;
        if (sourceRows > limits.maxRows) {
          throw new ImportFileError(
            'TOO_MANY_ROWS',
            `The workbook exceeds the ${limits.maxRows} data-row limit across its worksheets.`,
          );
        }
        source[sheet.name] = readWorksheetRows(workbook, sheet.name, limits).rows;
      }
    } catch (error) {
      if (error instanceof ImportFileError) throw this.unsupported(error.message);
      throw error;
    }
    if (Object.keys(source).length === 0) {
      throw this.unsupported(
        sheets[0]?.problem ?? 'The workbook has no worksheet with data rows below a header row.',
      );
    }

    const now = Date.now();
    const meta: PreviewMeta = {
      id: uuidv7(),
      ownerUserId: actorUserId,
      originalFilename: filename,
      fileSizeBytes: bytes.byteLength,
      fileSha256: createHash('sha256').update(bytes).digest('hex'),
      createdAt: now,
      expiresAt: now + RESULT_PREVIEW_TTL_MS,
      context,
      sheets,
      mapping: null,
      counts: null,
    };
    await this.store.create(meta, source);
    await this.audit.writeAuditEvent({
      actorUserId,
      action: AUDIT_ACTIONS.resultImportPreviewCreated,
      entityType: 'ResultImportPreview',
      entityId: meta.id,
      metadata: {
        previewId: meta.id,
        examinationId: resolved.exam.id,
        curriculumId: resolved.curriculum.id,
        periodNumber: resolved.exam.semesterNumber,
        fileSizeBytes: meta.fileSizeBytes,
        sha256: meta.fileSha256,
        worksheets: sheets.length,
      },
    });
    return this.present(meta, resolved);
  }

  async get(id: string, userId: string): Promise<ResultPreview> {
    const meta = await this.requireMeta(id, userId);
    // Read-only: an examination closed since the upload still shows the preview (it can be discarded).
    return this.present(meta, await this.resolveContext(meta.context, false));
  }

  async validate(
    id: string,
    mapping: ResultPreviewMapping,
    actorUserId: string,
  ): Promise<ResultPreview> {
    const meta = await this.requireMeta(id, actorUserId);
    // The context is re-checked: the examination may have been archived since the upload.
    const resolved = await this.resolveContext(meta.context);
    const problems = validateResultMapping(mapping, meta.sheets, resolved.requiredFields);
    if (problems.length > 0) throw Errors.validation(problems);
    const sheetRows = (await this.store.source(id))?.[mapping.worksheet];
    if (!sheetRows)
      throw Errors.validation([{ path: 'worksheet', message: 'Choose another worksheet.' }]);

    const letters = Object.fromEntries(
      RESULT_IMPORT_FIELD_KEYS.map((field) => {
        const column = mapping.columns[field] ?? null;
        return [field, column === null ? null : columnLetter(column)];
      }),
    ) as Record<ResultImportField, string | null>;
    const rows = sheetRows.map((row) => {
      const rawData: RawRowData = {};
      row.cells.forEach((cell, index) => {
        if (cell.type !== 'blank') rawData[columnLetter(index + 1)] = cell;
      });
      return { rowNumber: row.rowNumber, rawData };
    });

    // Registrations are looked up ONLY within the selected course: a registration number of
    // another course reads as "not registered in the selected course" and reveals nothing more.
    const numbers = new Set<string>();
    for (const row of rows) {
      const cell = letters.registrationNumber ? row.rawData[letters.registrationNumber] : undefined;
      if (cell?.type === 'string')
        numbers.add(normalizeRegistrationNumber(normalizeImportValue(cell.value)));
    }
    const registrations = await this.prisma.client.studentRegistration.findMany({
      where: {
        programId: resolved.exam.programId,
        registrationNumberNormalized: { in: [...numbers] },
      },
      select: { id: true, registrationNumberNormalized: true, curriculumId: true, status: true },
    });
    const withResults = await this.prisma.client.result.findMany({
      where: {
        examinationId: resolved.exam.id,
        studentRegistrationId: { in: registrations.map((registration) => registration.id) },
      },
      select: { studentRegistrationId: true },
    });

    const outcomes = validateResultRows(rows, letters, {
      academicPeriod: String(resolved.exam.semesterNumber),
      expectedCurriculumId: resolved.curriculum.id,
      gradesAccepted: false,
      registrations: new Map<string, ResultExistingRegistration>(
        registrations.map((registration) => [
          registration.registrationNumberNormalized,
          registration,
        ]),
      ),
      curriculumSubjects: new Map([[resolved.curriculum.id, resolved.programSubjects]]),
      registrationsWithResults: new Set(withResults.map((result) => result.studentRegistrationId)),
    });

    const subjectNames = new Map(
      resolved.programSubjects.map((subject) => [subject.id, subject.subjectName ?? null]),
    );
    const outcomeRows: PreviewOutcomeRow[] = outcomes.map((outcome) => {
      const { registrationNumber, subjectCode, grade, ...marks } = outcome.normalizedData.values;
      return {
        rowNumber: outcome.rowNumber,
        status: outcome.status,
        registrationNumber: registrationNumber ?? null,
        subjectCode: subjectCode ?? null,
        subjectName: outcome.normalizedData.programSubjectId
          ? (subjectNames.get(outcome.normalizedData.programSubjectId) ?? null)
          : null,
        marks: grade === undefined ? marks : { ...marks, grade },
        issues: [...outcome.errors, ...outcome.warnings],
      };
    });
    const counts = {
      total: outcomeRows.length,
      valid: outcomeRows.filter((row) => row.status === 'VALID').length,
      warnings: outcomeRows.filter((row) => row.status === 'WARNING').length,
      errors: outcomeRows.filter((row) => row.status === 'ERROR').length,
    };
    const next: PreviewMeta = { ...meta, mapping, counts };
    await this.store.saveValidation(next, outcomeRows);
    await this.audit.writeAuditEvent({
      actorUserId,
      action: AUDIT_ACTIONS.resultImportPreviewValidated,
      entityType: 'ResultImportPreview',
      entityId: id,
      metadata: {
        previewId: id,
        examinationId: resolved.exam.id,
        mappedFields: RESULT_IMPORT_FIELD_KEYS.filter((field) => letters[field] !== null),
        ...counts,
      },
    });
    return this.present(next, resolved);
  }

  async rows(
    id: string,
    query: ResultPreviewRowQuery,
    userId: string,
  ): Promise<ResultPreviewRowList> {
    await this.requireMeta(id, userId);
    const all = (await this.store.rows(id)) ?? [];
    const search = query.search?.toUpperCase();
    const filtered = all.filter((row) => {
      if (query.filter === 'valid' && row.status !== 'VALID') return false;
      if (query.filter === 'warnings' && row.status !== 'WARNING') return false;
      if (query.filter === 'errors' && row.status !== 'ERROR') return false;
      if (query.code && !row.issues.some((issue) => issue.code === query.code)) return false;
      if (
        search &&
        !(row.registrationNumber ?? '').includes(search) &&
        !(row.subjectCode ?? '').toUpperCase().includes(search) &&
        String(row.rowNumber) !== search
      ) {
        return false;
      }
      return true;
    });
    if (query.sortOrder === 'desc') filtered.reverse();
    const start = (query.page - 1) * query.pageSize;
    return {
      data: filtered.slice(start, start + query.pageSize),
      meta: paginationMeta(query, filtered.length),
    };
  }

  async errorReport(id: string, actorUserId: string): Promise<DownloadFile> {
    const meta = await this.requireMeta(id, actorUserId);
    const rows = (await this.store.rows(id)) ?? [];
    const withIssues = rows.filter((row) => row.issues.length > 0);
    if (!meta.mapping || !meta.counts || withIssues.length === 0) {
      throw new AppError(
        HttpStatus.NOT_FOUND,
        ERROR_CODES.notFound,
        'There is no error report: no row has errors or warnings.',
      );
    }
    const resolved = await this.resolveContext(meta.context, false);
    const bytes = await buildResultErrorReport(
      withIssues.map((row) => ({
        rowNumber: row.rowNumber,
        registrationNumber: row.registrationNumber,
        subjectCode: row.subjectCode,
        errors: row.issues.filter((issue) => issue.severity === 'error'),
        warnings: row.issues.filter((issue) => issue.severity === 'warning'),
      })),
      {
        filename: meta.originalFilename,
        worksheet: meta.mapping.worksheet,
        generatedAt: new Date(),
        context: [
          ['Course', `${resolved.exam.program.code} — ${resolved.exam.program.name}`],
          [
            'Curriculum version',
            `${resolved.curriculum.versionCode} — ${resolved.curriculum.name}`,
          ],
          ['Academic session', resolved.exam.academicSession.name],
          [
            'Semester / year',
            periodLabel(resolved.curriculum.structureType, resolved.exam.semesterNumber),
          ],
          ['Examination', `${resolved.exam.code} — ${resolved.exam.name}`],
        ],
        counts: {
          'Total rows': meta.counts.total,
          'Valid rows': meta.counts.valid,
          'Rows with warnings': meta.counts.warnings,
          'Rows with errors': meta.counts.errors,
        },
      },
    );
    await this.audit.writeAuditEvent({
      actorUserId,
      action: AUDIT_ACTIONS.resultImportPreviewReportDownloaded,
      entityType: 'ResultImportPreview',
      entityId: id,
      metadata: { previewId: id, rows: withIssues.length },
    });
    return { filename: 'results-preview-issues.xlsx', bytes };
  }

  async discard(id: string, actorUserId: string): Promise<void> {
    const meta = await this.requireMeta(id, actorUserId);
    await this.store.discard(meta);
    await this.audit.writeAuditEvent({
      actorUserId,
      action: AUDIT_ACTIONS.resultImportPreviewDiscarded,
      entityType: 'ResultImportPreview',
      entityId: id,
      metadata: { previewId: id },
    });
  }

  private present(
    meta: PreviewMeta,
    resolved: Awaited<ReturnType<ResultImportsService['resolveContext']>>,
  ): ResultPreview {
    const { exam, curriculum } = resolved;
    return {
      id: meta.id,
      status: meta.counts ? 'VALIDATED' : 'MAPPING',
      previewOnly: true,
      originalFilename: meta.originalFilename,
      fileSizeBytes: meta.fileSizeBytes,
      createdAt: new Date(meta.createdAt).toISOString(),
      expiresAt: new Date(meta.expiresAt).toISOString(),
      context: {
        program: exam.program,
        curriculum: {
          id: curriculum.id,
          versionCode: curriculum.versionCode,
          name: curriculum.name,
          structureType: curriculum.structureType,
        },
        academicSession: exam.academicSession,
        period: {
          number: exam.semesterNumber,
          label: periodLabel(curriculum.structureType, exam.semesterNumber),
        },
        examination: {
          id: exam.id,
          code: exam.code,
          name: exam.name,
          kind: exam.kind,
          examSession: exam.examSession,
        },
        subjectCount: resolved.periodSubjectCount,
      },
      components: resolved.components,
      unrecognizedComponents: resolved.unrecognizedComponents,
      sheets: meta.sheets,
      mapping: meta.mapping,
      counts: meta.counts,
      hasErrorReport: meta.counts !== null && meta.counts.warnings + meta.counts.errors > 0,
    };
  }
}
