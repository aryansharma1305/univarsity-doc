import type { StatusTone } from '@docversity/ui';
import type { ImportRowAction, ImportRowStatus, ImportStatus } from '@docversity/validation';

export const IMPORT_STATUS: Record<ImportStatus, { label: string; tone: StatusTone }> = {
  UPLOADED: { label: 'Reading file', tone: 'info' },
  MAPPING: { label: 'Needs mapping', tone: 'warning' },
  VALIDATING: { label: 'Validating', tone: 'info' },
  VALIDATED: { label: 'Ready to review', tone: 'warning' },
  PROCESSING: { label: 'Importing', tone: 'info' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

export const IMPORT_STATUS_OPTIONS = (Object.keys(IMPORT_STATUS) as ImportStatus[]).map(
  (value) => ({ value, label: IMPORT_STATUS[value].label }),
);

export const ROW_STATUS: Record<ImportRowStatus, { label: string; tone: StatusTone }> = {
  VALID: { label: 'Valid', tone: 'success' },
  WARNING: { label: 'Warning', tone: 'warning' },
  ERROR: { label: 'Error', tone: 'danger' },
  IMPORTED: { label: 'Imported', tone: 'success' },
  SKIPPED: { label: 'Skipped', tone: 'neutral' },
};

export const ROW_ACTION: Record<ImportRowAction, { label: string; description: string }> = {
  CREATE: { label: 'Create', description: 'A new student and registration will be created.' },
  UPDATE: { label: 'Update', description: 'Changes to an existing record (needs approval).' },
  SKIP: { label: 'No change', description: 'Already up to date — nothing to import.' },
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}
