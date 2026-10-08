import type { ActivityItem } from '@docversity/validation';

interface AuditRow {
  id: string;
  action: string;
  metadata: unknown;
  createdAt: Date;
  actor: { displayName: string } | null;
}

const FIELD_LABELS: Record<string, string> = {
  code: 'code',
  name: 'name',
  level: 'level',
  durationSemesters: 'duration',
  departmentId: 'department',
  startsOn: 'start date',
  endsOn: 'end date',
  fullName: 'full name',
  fatherName: "father's name",
  motherName: "mother's name",
  dateOfBirth: 'date of birth',
  gender: 'gender',
  registrationNumber: 'registration number',
  rollReferenceNumber: 'roll / reference number',
  programId: 'program',
  academicSessionId: 'academic session',
  admissionDate: 'admission date',
  completionDate: 'completion date',
};

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function fields(metadata: Record<string, unknown>): string {
  const list = Array.isArray(metadata.changedFields) ? (metadata.changedFields as unknown[]) : [];
  const labels = list.map((field) => FIELD_LABELS[String(field)] ?? 'other details');
  return labels.length > 0 ? ` (${labels.join(', ')})` : '';
}

function viaImport(metadata: Record<string, unknown>): string {
  return metadata.source === 'import' ? ' by import' : '';
}

function count(metadata: Record<string, unknown>, key: string): number {
  const value = metadata[key];
  return typeof value === 'number' ? value : 0;
}

function plural(value: number, word: string): string {
  return `${value.toLocaleString('en-US')} ${word}${value === 1 ? '' : 's'}`;
}

function status(metadata: Record<string, unknown>): string {
  const from = str(metadata.from)?.toLowerCase();
  const to = str(metadata.to)?.toLowerCase();
  return from && to ? ` from ${from} to ${to}` : '';
}

/**
 * Human-readable, safe summary of an audit entry for staff screens. Built only from identifiers
 * (codes, registration numbers), field NAMES and statuses — never personal values.
 */
export function summarizeAudit(row: AuditRow): ActivityItem {
  const meta = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<
    string,
    unknown
  >;
  const code = str(meta.code);
  const registration = str(meta.registrationNumber);
  const summaries: Record<string, string> = {
    DEPARTMENT_CREATED: `Department ${code ?? ''} created`,
    DEPARTMENT_UPDATED: `Department ${code ?? ''} updated${fields(meta)}`,
    DEPARTMENT_STATUS_CHANGED: `Department ${code ?? ''} status changed${status(meta)}`,
    PROGRAM_CREATED: `Program ${code ?? ''} created`,
    PROGRAM_UPDATED: `Program ${code ?? ''} updated${fields(meta)}`,
    PROGRAM_STATUS_CHANGED: `Program ${code ?? ''} status changed${status(meta)}`,
    ACADEMIC_SESSION_CREATED: `Academic session ${code ?? ''} created`,
    ACADEMIC_SESSION_UPDATED: `Academic session ${code ?? ''} updated${fields(meta)}`,
    ACADEMIC_SESSION_STATUS_CHANGED: `Academic session ${code ?? ''} status changed${status(meta)}`,
    STUDENT_CREATED: `Student record created${viaImport(meta)}`,
    STUDENT_UPDATED: `Personal details updated${viaImport(meta)}${fields(meta)}`,
    REGISTRATION_CREATED: `Registration ${registration ?? ''} created${viaImport(meta)}`,
    REGISTRATION_UPDATED: `Registration ${registration ?? ''} updated${viaImport(meta)}${fields(meta)}`,
    REGISTRATION_STATUS_CHANGED: `Registration ${registration ?? ''} status changed${status(meta)}`,
    STUDENT_IMPORT_COMMITTED: `Student import completed: ${plural(count(meta, 'createdRecords'), 'record')} created, ${plural(count(meta, 'updatedRecords'), 'record')} updated`,
  };
  return {
    id: row.id,
    action: row.action,
    summary: (summaries[row.action] ?? row.action.replaceAll('_', ' ').toLowerCase())
      .replace(/\s+/g, ' ')
      .trim(),
    actor: row.actor?.displayName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
