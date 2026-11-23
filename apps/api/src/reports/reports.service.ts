import { AUDIT_ACTIONS } from '@docversity/types';
import { Injectable } from '@nestjs/common';
import type { Report, ReportName, ReportQuery } from '@docversity/validation';
import { PrismaService } from '../database/prisma.service.js';

type Row = Record<string, string | number | null>;
interface Definition {
  columns: { key: string; label: string }[];
  /** Column holding the count (summed into `total`). */
  countKey: string;
  rows: (query: ReportQuery) => Promise<Row[]>;
}

/** Calendar dates are UTC days; `to` is inclusive. */
function range(query: ReportQuery) {
  if (!query.from && !query.to) return undefined;
  const to = query.to ? new Date(`${query.to}T00:00:00.000Z`) : undefined;
  if (to) to.setUTCDate(to.getUTCDate() + 1);
  return {
    ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
    ...(to ? { lt: to } : {}),
  };
}

/** Spreadsheet formula injection guard: cells starting with = + - @ tab or CR are prefixed. */
function csvCell(value: string | number | null): string {
  if (value === null) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Aggregate operational reports. Rows are grouped counts with codes and names of courses,
 * sessions and examinations only — never student names, registration numbers or contact details.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly definitions: Record<ReportName, Definition> = {
    enrolment: {
      columns: [
        { key: 'courseCode', label: 'Course code' },
        { key: 'courseName', label: 'Course' },
        { key: 'sessionCode', label: 'Academic session' },
        { key: 'status', label: 'Registration status' },
        { key: 'registrations', label: 'Registrations' },
      ],
      countKey: 'registrations',
      rows: async (query) => {
        const db = this.prisma.client;
        const groups = await db.studentRegistration.groupBy({
          by: ['programId', 'academicSessionId', 'status'],
          where: {
            ...(query.programId ? { programId: query.programId } : {}),
            ...(query.academicSessionId ? { academicSessionId: query.academicSessionId } : {}),
            ...(query.status ? { status: query.status } : {}),
          },
          _count: { _all: true },
        });
        const [programs, sessions] = await Promise.all([
          this.programs(groups.map((g) => g.programId)),
          this.sessions(groups.map((g) => g.academicSessionId)),
        ]);
        return groups.map((g) => ({
          courseCode: programs.get(g.programId)?.code ?? null,
          courseName: programs.get(g.programId)?.name ?? null,
          sessionCode: sessions.get(g.academicSessionId)?.code ?? null,
          status: g.status,
          registrations: g._count._all,
        }));
      },
    },
    'certificate-requests': {
      columns: [
        { key: 'certificateType', label: 'Certificate type' },
        { key: 'status', label: 'Status' },
        { key: 'requests', label: 'Requests' },
      ],
      countKey: 'requests',
      rows: async (query) =>
        (
          await this.prisma.client.certificateRequest.groupBy({
            by: ['certificateType', 'status'],
            where: { submittedAt: range(query) },
            _count: { _all: true },
          })
        ).map((g) => ({
          certificateType: g.certificateType,
          status: g.status,
          requests: g._count._all,
        })),
    },
    'issued-documents': {
      columns: [
        { key: 'documentType', label: 'Document type' },
        { key: 'status', label: 'Status' },
        { key: 'documents', label: 'Documents' },
      ],
      countKey: 'documents',
      rows: async (query) =>
        (
          await this.prisma.client.certificate.groupBy({
            by: ['documentType', 'status'],
            where: {
              createdAt: range(query),
              ...(query.programId ? { programId: query.programId } : {}),
            },
            _count: { _all: true },
          })
        ).map((g) => ({
          documentType: g.documentType,
          status: g.status,
          documents: g._count._all,
        })),
    },
    results: {
      columns: [
        { key: 'examinationCode', label: 'Examination code' },
        { key: 'examinationName', label: 'Examination' },
        { key: 'courseCode', label: 'Course code' },
        { key: 'sessionCode', label: 'Academic session' },
        { key: 'status', label: 'Result status' },
        { key: 'results', label: 'Results' },
      ],
      countKey: 'results',
      rows: async (query) => {
        const groups = await this.prisma.client.result.groupBy({
          by: ['examinationId', 'publicationStatus'],
          where: { examination: this.examinationWhere(query) },
          _count: { _all: true },
        });
        const exams = await this.examinations(groups.map((g) => g.examinationId));
        return groups.map((g) => ({
          ...exams.get(g.examinationId),
          status: g.publicationStatus,
          results: g._count._all,
        }));
      },
    },
    're-exam-applications': {
      columns: [
        { key: 'examinationCode', label: 'Examination code' },
        { key: 'examinationName', label: 'Examination' },
        { key: 'courseCode', label: 'Course code' },
        { key: 'sessionCode', label: 'Academic session' },
        { key: 'status', label: 'Application status' },
        { key: 'applications', label: 'Applications' },
      ],
      countKey: 'applications',
      rows: async (query) => {
        const groups = await this.prisma.client.reExamApplication.groupBy({
          by: ['examinationId', 'status'],
          where: { examination: this.examinationWhere(query) },
          _count: { _all: true },
        });
        const exams = await this.examinations(groups.map((g) => g.examinationId));
        return groups.map((g) => ({
          ...exams.get(g.examinationId),
          status: g.status,
          applications: g._count._all,
        }));
      },
    },
    'verification-activity': {
      columns: [
        { key: 'service', label: 'Service' },
        { key: 'kind', label: 'Check' },
        { key: 'outcome', label: 'Outcome' },
        { key: 'lookups', label: 'Lookups' },
      ],
      countKey: 'lookups',
      // Public checks are audited (hashes and outcomes only) as PUBLIC_VERIFICATION_* events.
      rows: async (query) => {
        const created = range(query);
        const groups = await this.prisma.client.$queryRaw<
          { service: string | null; kind: string; outcome: string | null; lookups: bigint }[]
        >`
          SELECT metadata->>'service' AS service,
            CASE WHEN metadata->>'kind' = 'DOCUMENT' THEN 'DOCUMENT_ACCESS' ELSE 'LOOKUP' END AS kind,
            metadata->>'outcome' AS outcome, count(*) AS lookups
          FROM audit_logs
          WHERE action IN (${AUDIT_ACTIONS.publicVerificationChecked}, ${AUDIT_ACTIONS.publicVerificationUnavailable})
            AND created_at >= ${created?.gte ?? new Date(0)}
            AND created_at < ${created?.lt ?? new Date('9999-01-01T00:00:00Z')}
          GROUP BY 1, 2, 3
        `;
        return groups.map((g) => ({
          service: g.service,
          kind: g.kind,
          outcome: g.outcome,
          lookups: Number(g.lookups),
        }));
      },
    },
    'student-messages': {
      columns: [
        { key: 'status', label: 'Conversation status' },
        { key: 'conversations', label: 'Conversations' },
      ],
      countKey: 'conversations',
      rows: async (query) =>
        (
          await this.prisma.client.messageThread.groupBy({
            by: ['status'],
            where: { createdAt: range(query) },
            _count: { _all: true },
          })
        ).map((g) => ({ status: g.status, conversations: g._count._all })),
    },
    'verification-queries': {
      columns: [
        { key: 'source', label: 'Source' },
        { key: 'category', label: 'Category' },
        { key: 'status', label: 'Status' },
        { key: 'queries', label: 'Queries' },
      ],
      countKey: 'queries',
      rows: async (query) =>
        (
          await this.prisma.client.verificationQuery.groupBy({
            by: ['source', 'category', 'status'],
            where: { createdAt: range(query) },
            _count: { _all: true },
          })
        ).map((g) => ({
          source: g.source,
          category: g.category,
          status: g.status,
          queries: g._count._all,
        })),
    },
  };

  async run(name: ReportName, query: ReportQuery): Promise<Report> {
    const definition = this.definitions[name];
    const rows = (await definition.rows(query)).sort(
      (a, b) =>
        definition.columns
          .filter((column) => column.key !== definition.countKey)
          .map((column) => String(a[column.key] ?? '').localeCompare(String(b[column.key] ?? '')))
          .find((order) => order !== 0) ?? 0,
    );
    return {
      report: name,
      columns: definition.columns,
      rows,
      total: rows.reduce((sum, row) => sum + Number(row[definition.countKey] ?? 0), 0),
      generatedAt: new Date().toISOString(),
    };
  }

  async csv(name: ReportName, query: ReportQuery): Promise<{ filename: string; bytes: Buffer }> {
    const report = await this.run(name, query);
    const lines = [
      report.columns.map((column) => csvCell(column.label)).join(','),
      ...report.rows.map((row) =>
        report.columns.map((column) => csvCell(row[column.key] ?? null)).join(','),
      ),
    ];
    return {
      filename: `docversity-${name}-${report.generatedAt.slice(0, 10)}.csv`,
      // BOM so spreadsheet software reads UTF-8 course names correctly.
      bytes: Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8'),
    };
  }

  private examinationWhere(query: ReportQuery) {
    return {
      ...(query.programId ? { programId: query.programId } : {}),
      ...(query.academicSessionId ? { academicSessionId: query.academicSessionId } : {}),
    };
  }

  private async programs(ids: string[]) {
    const rows = await this.prisma.client.program.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, code: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async sessions(ids: string[]) {
    const rows = await this.prisma.client.academicSession.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, code: true },
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async examinations(ids: string[]) {
    const rows = await this.prisma.client.examination.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: {
        id: true,
        code: true,
        name: true,
        program: { select: { code: true } },
        academicSession: { select: { code: true } },
      },
    });
    return new Map(
      rows.map((row) => [
        row.id,
        {
          examinationCode: row.code,
          examinationName: row.name,
          courseCode: row.program.code,
          sessionCode: row.academicSession.code,
        },
      ]),
    );
  }
}
