import type { StatusTone } from '@docversity/ui';
import {
  EXAMINATION_KIND_LABELS,
  EXAMINATION_KINDS,
  type ExaminationStatus,
} from '@docversity/validation';

export const EXAM_STATUS: Record<ExaminationStatus, { label: string; tone: StatusTone }> = {
  DRAFT: { label: 'Draft (not visible)', tone: 'warning' },
  OPEN: { label: 'Open (visible to students)', tone: 'success' },
  UNDER_REVIEW: { label: 'Under review', tone: 'info' },
  PUBLISHED: { label: 'Published', tone: 'info' },
  ARCHIVED: { label: 'Archived', tone: 'neutral' },
};

export const KIND_OPTIONS = EXAMINATION_KINDS.map((value) => ({
  value,
  label: EXAMINATION_KIND_LABELS[value],
}));

export const STATUS_FILTER_OPTIONS = (['DRAFT', 'OPEN', 'ARCHIVED'] as const).map((value) => ({
  value,
  label: EXAM_STATUS[value].label,
}));
