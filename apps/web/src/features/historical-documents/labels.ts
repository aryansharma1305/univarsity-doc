import type { StatusTone } from '@docversity/ui';
import {
  AUTHENTICITY_LABELS,
  type DocumentAuthenticity,
  HISTORICAL_DOCUMENT_TYPE_LABELS,
  HISTORICAL_DOCUMENT_TYPES,
  type HistoricalDocumentStatus,
  type HistoricalDocumentVersion,
  PROVENANCE_LABELS,
  DOCUMENT_PROVENANCES,
} from '@docversity/validation';

export const STATUS: Record<HistoricalDocumentStatus, { label: string; tone: StatusTone }> = {
  DRAFT: { label: 'Draft (not visible)', tone: 'warning' },
  PUBLISHED: { label: 'Published to student', tone: 'success' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'danger' },
  SUPERSEDED: { label: 'Superseded', tone: 'neutral' },
};

export const AUTHENTICITY: Record<DocumentAuthenticity, { label: string; tone: StatusTone }> = {
  UNVERIFIED: { label: AUTHENTICITY_LABELS.UNVERIFIED, tone: 'neutral' },
  CONFIRMED_AGAINST_RECORDS: { label: AUTHENTICITY_LABELS.CONFIRMED_AGAINST_RECORDS, tone: 'info' },
  DISPUTED: { label: AUTHENTICITY_LABELS.DISPUTED, tone: 'danger' },
};

export const TYPE_OPTIONS = HISTORICAL_DOCUMENT_TYPES.map((value) => ({
  value,
  label: HISTORICAL_DOCUMENT_TYPE_LABELS[value],
}));

export const PROVENANCE_OPTIONS = DOCUMENT_PROVENANCES.map((value) => ({
  value,
  label: PROVENANCE_LABELS[value],
}));

export const STATUS_OPTIONS = (Object.keys(STATUS) as HistoricalDocumentStatus[]).map((value) => ({
  value,
  label: STATUS[value].label,
}));

export const AUTHENTICITY_OPTIONS = (Object.keys(AUTHENTICITY) as DocumentAuthenticity[]).map(
  (value) => ({ value, label: AUTHENTICITY[value].label }),
);

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileKind(contentType: string): string {
  return contentType === 'application/pdf'
    ? 'PDF'
    : contentType === 'image/png'
      ? 'PNG image'
      : 'JPEG image';
}

/** "Revision 2 · HD-1B97-2390": identifies a version even when titles are identical. */
export function versionLabel(version: Pick<HistoricalDocumentVersion, 'revision' | 'reference'>) {
  return `Revision ${String(version.revision)} · ${version.reference}`;
}
