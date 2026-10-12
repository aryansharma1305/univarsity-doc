import { marksheetPreviewInputSchema, type MarksheetPreviewInput } from '@docversity/validation';
export const SYNTHETIC_FIXTURES = [
  { id: 'semester', label: 'Semester-wise sample', periodType: 'SEMESTER_WISE' },
  { id: 'year', label: 'Year-wise sample', periodType: 'YEAR_WISE' },
  { id: 'stress', label: 'Long subjects · multiple pages', periodType: 'YEAR_WISE' },
] as const;
/** Invented document examples, never database records or result snapshots. */
export function syntheticMarksheet(fixture: 'semester' | 'year' | 'stress'): MarksheetPreviewInput {
  const year = fixture !== 'semester';
  const names = [
    'Foundations of analytical reasoning',
    'Applied mathematics and quantitative methods',
    'Research methods and academic communication',
    'Environmental systems and sustainable development',
    'Laboratory practice and experimental observation',
  ];
  const subjects = Array.from({ length: fixture === 'stress' ? 48 : 5 }, (_, i) => ({
    code: `SAMPLE-${String(i + 1).padStart(2, '0')}`,
    name:
      fixture === 'stress'
        ? `Synthetic subject ${i + 1}: Advanced interdisciplinary research, evidence-based analytical methods and sustainable systems in contemporary academic practice`
        : (names[i] ?? 'Synthetic subject'),
    internal: { maximum: '30', obtained: i === 0 ? '0' : '24', state: 'RECORDED' },
    external:
      i === 3
        ? { maximum: '70', obtained: null, state: 'WITHHELD' }
        : { maximum: '70', obtained: '56', state: 'RECORDED' },
    ...(i === 4 ? { practical: { maximum: '25', obtained: null, state: 'UNAVAILABLE' } } : {}),
    total: { maximum: i === 4 ? '125' : '100', obtained: null, state: 'UNAVAILABLE' },
  }));
  return marksheetPreviewInputSchema.parse({
    kind: 'SYNTHETIC_PREVIEW',
    institution: {
      name: 'Example University of Learning',
      address: '100 Sample Avenue, Fictional City · Fictitious institution',
      identifier: 'SAMPLE-INSTITUTION',
      officeTitle: 'Sample Examination Office',
      logoAsset: 'NONE',
    },
    student: {
      fullName: 'Alex Sample',
      registrationNumber:
        fixture === 'stress'
          ? 'SAMPLE/REGISTRATION/VERY-LONG/2026/00000000000000000001'
          : 'SAMPLE/2026/001',
      programName:
        fixture === 'stress'
          ? 'Bachelor of Interdisciplinary Studies in Applied Sciences, Research Methods and Sustainable Development'
          : 'Bachelor of Applied Studies',
      courseName: 'Illustrative curriculum',
      academicSession: '2025–2028 (synthetic batch)',
      academicLevel: 'Undergraduate',
    },
    examination: { session: '2026 sample examination', attemptLabel: 'Regular · sample only' },
    period: {
      type: year ? 'YEAR_WISE' : 'SEMESTER_WISE',
      number: year ? 1 : 2,
      label: year ? 'Annual assessment' : 'Core studies',
    },
    subjects,
    summary: { gpa: null, percentage: null, officialStatus: null },
  });
}
