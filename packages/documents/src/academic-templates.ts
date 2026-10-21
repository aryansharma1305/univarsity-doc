import {
  ACADEMIC_TEMPLATE_IDS,
  academicCertificateInputSchema,
  academicCertificateTemplateSchema,
  type AcademicCertificateInput,
  type AcademicCertificateTemplate,
  type AcademicCertificateType,
  type AcademicFixture,
} from '@docversity/validation';

/**
 * Phase 12C synthetic academic certificate templates. Released definitions are immutable code
 * snapshots; a change is a new version. Separate from the Phase 12A training certificate.
 */
const DEFINITIONS: readonly AcademicCertificateTemplate[] = [
  {
    id: ACADEMIC_TEMPLATE_IDS.COURSE_COMPLETION,
    version: 1,
    type: 'COURSE_COMPLETION',
    status: 'PREVIEW_ONLY',
    name: 'Course Completion Certificate · synthetic preview',
    title: 'Course Completion Certificate',
    description:
      'Records completion of one named short course. It is not a degree, diploma or provisional certificate.',
    signatoryTitles: ['Sample Course Coordinator', 'Sample Registrar'],
  },
  {
    id: ACADEMIC_TEMPLATE_IDS.TRANSCRIPT,
    version: 1,
    type: 'TRANSCRIPT',
    status: 'PREVIEW_ONLY',
    name: 'Transcript · synthetic preview',
    title: 'Transcript of Academic Record',
    description:
      'Lists subjects and marks by semester or year. Sample marks are invented; no grade or GPA is computed.',
    signatoryTitles: ['Sample Controller of Examinations'],
  },
  {
    id: ACADEMIC_TEMPLATE_IDS.PROVISIONAL,
    version: 1,
    type: 'PROVISIONAL',
    status: 'PREVIEW_ONLY',
    name: 'Provisional Certificate · synthetic preview',
    title: 'Provisional Certificate',
    description:
      'States that the final examination was passed, pending the formal award of the degree.',
    signatoryTitles: ['Sample Controller of Examinations', 'Sample Registrar'],
  },
  {
    id: ACADEMIC_TEMPLATE_IDS.CHARACTER,
    version: 1,
    type: 'CHARACTER',
    status: 'PREVIEW_ONLY',
    name: 'Character Certificate · synthetic preview',
    title: 'Character Certificate',
    description: 'Attests conduct during the period of study recorded by the university.',
    signatoryTitles: ['Sample Registrar'],
  },
  {
    id: ACADEMIC_TEMPLATE_IDS.MIGRATION,
    version: 1,
    type: 'MIGRATION',
    status: 'PREVIEW_ONLY',
    name: 'Migration Certificate · synthetic preview',
    title: 'Migration Certificate',
    description:
      'States that the university has no objection to the student continuing at another institution.',
    signatoryTitles: ['Sample Registrar'],
  },
].map((d) => Object.freeze(academicCertificateTemplateSchema.parse(d)));

/** Return validated copies: callers cannot mutate the versioned registry. */
export function academicCertificateTemplates(): AcademicCertificateTemplate[] {
  return DEFINITIONS.map((d) => academicCertificateTemplateSchema.parse(d));
}

export function academicCertificateTemplate(
  type: AcademicCertificateType,
  version: number,
): AcademicCertificateTemplate {
  const found = DEFINITIONS.find((d) => d.type === type && d.version === version);
  if (!found) throw new Error('Unsupported preview template version.');
  return academicCertificateTemplateSchema.parse(found);
}

const ALL_TYPES = [
  'COURSE_COMPLETION',
  'TRANSCRIPT',
  'PROVISIONAL',
  'CHARACTER',
  'MIGRATION',
] as const;
export const ACADEMIC_FIXTURES = [
  { id: 'standard', label: 'Standard sample', certificateTypes: ALL_TYPES },
  { id: 'long-text', label: 'Long names and programme sample', certificateTypes: ALL_TYPES },
  {
    id: 'stress-semester',
    label: 'Multipage · 8 semesters (stress)',
    certificateTypes: ['TRANSCRIPT'],
  },
  { id: 'stress-year', label: 'Multipage · 4 years (stress)', certificateTypes: ['TRANSCRIPT'] },
] as const;

const SUBJECTS = [
  'Foundations of analytical reasoning',
  'Applied quantitative methods',
  'Research methods and academic writing',
  'Environmental systems',
  'Laboratory practice',
  'Professional ethics',
];
const LONG_SUBJECT =
  'Advanced interdisciplinary research methods and evidence-based analysis in contemporary practice';

const STRESS_SUBJECTS = [
  'Foundations of analytical reasoning',
  'Applied quantitative methods and statistical modelling for the social and natural sciences',
  'Research methods and academic writing',
  'Environmental systems, climate resilience and sustainable infrastructure planning',
  'Laboratory practice',
  'Professional ethics and responsible conduct in research',
  'Data management, documentation and reproducible analysis workflows',
  'Field study',
];

/**
 * Multipage stress transcript: a 48-month programme (policy tier "more than 24 months"), either eight
 * semesters of eight subjects or four years of fourteen. Invented marks; nothing is graded.
 */
function stressTranscript(structure: 'SEMESTER_WISE' | 'YEAR_WISE'): AcademicCertificateInput {
  const semester = structure === 'SEMESTER_WISE';
  const periods = semester ? 8 : 4;
  const perPeriod = semester ? 8 : 14;
  return academicCertificateInputSchema.parse({
    type: 'TRANSCRIPT',
    kind: 'SYNTHETIC_PREVIEW',
    institutionName: 'Example University of Learning',
    studentName: 'Alexandra Morgan Sample-Example',
    guardianName: 'Jordan Christopher Sample-Example',
    registrationNumber: semester ? 'SAMPLE-REG-2022-STRESS-SEM' : 'SAMPLE-REG-2022-STRESS-YEAR',
    issueDate: '2026-06-30',
    certificateReference: semester
      ? 'SAMPLE-TRANSCRIPT-STRESS-SEM'
      : 'SAMPLE-TRANSCRIPT-STRESS-YEAR',
    programName: 'Bachelor of Interdisciplinary Studies in Applied Sciences',
    sessionText: '2022–2026 (48 months)',
    structure,
    periods: Array.from({ length: periods }, (_, p) => ({
      label: `${semester ? 'Semester' : 'Year'} ${p + 1}`,
      subjects: Array.from({ length: perPeriod }, (_, i) => {
        const practical = i % 4 === 3;
        return {
          code: `SAMPLE-${semester ? 'S' : 'Y'}${p + 1}-${String(i + 1).padStart(2, '0')}`,
          name: `${STRESS_SUBJECTS[(i + p) % STRESS_SUBJECTS.length] ?? 'Sample subject'}${practical ? ' (practical)' : ''}`,
          maximum: practical ? '50' : '100',
          obtained: String((practical ? 28 : 55) + ((i * 7 + p * 3) % (practical ? 20 : 40))),
        };
      }),
    })),
  });
}

/**
 * Invented records only. Each type's standard fixture belongs to the synthetic course whose duration
 * the university policy maps to that type (3 / 18 / 24 / 36 months), so samples never cross tiers.
 */
export function syntheticAcademicCertificate(
  type: AcademicCertificateType,
  fixture: AcademicFixture,
): AcademicCertificateInput {
  const known = ACADEMIC_FIXTURES.find((f) => f.id === fixture);
  if (!known || !(known.certificateTypes as readonly string[]).includes(type))
    throw new Error('Unsupported synthetic fixture.');
  if (type === 'TRANSCRIPT' && (fixture === 'stress-semester' || fixture === 'stress-year'))
    return stressTranscript(fixture === 'stress-semester' ? 'SEMESTER_WISE' : 'YEAR_WISE');
  const long = fixture === 'long-text';
  const common = {
    kind: 'SYNTHETIC_PREVIEW',
    institutionName: 'Example University of Learning',
    studentName: long ? 'Alexandra Morgan Sample-Example' : 'Alex Sample',
    guardianName: long ? 'Jordan Christopher Sample-Example' : 'Jordan Sample',
    registrationNumber: long ? 'SAMPLE-REG-2023-LONG-000000000001' : 'SAMPLE-REG-0001',
    issueDate: '2026-06-30',
    certificateReference: `SAMPLE-${type.replace('_', '-')}-V1`,
  } as const;
  const degree = long
    ? 'Bachelor of Interdisciplinary Studies in Applied Sciences and Sustainable Development'
    : 'Bachelor of Applied Studies';
  switch (type) {
    case 'COURSE_COMPLETION':
      return academicCertificateInputSchema.parse({
        type,
        ...common,
        programName: long
          ? 'Certificate Programme in Clinical Data Handling and Healthcare Records Practice'
          : 'Certificate Programme in Clinical Data Handling',
        courseName: long
          ? 'Clinical Data Handling, Healthcare Records Practice and Information Governance'
          : 'Clinical Data Handling',
        durationText: '3 months',
        periodText: 'January 2026 to March 2026',
      });
    case 'TRANSCRIPT':
      return academicCertificateInputSchema.parse({
        type,
        ...common,
        programName: long
          ? 'Postgraduate Diploma in Applied Research Methods and Sustainable Systems Practice'
          : 'Postgraduate Diploma in Applied Research',
        sessionText: '2024–2026 (18 months)',
        structure: 'SEMESTER_WISE',
        periods: (long
          ? ['Semester 1', 'Semester 2']
          : ['Semester 1', 'Semester 2', 'Semester 3']
        ).map((label, p) => ({
          label,
          subjects: Array.from({ length: 4 }, (_, i) => ({
            code: `SAMPLE-S${p + 1}-${String(i + 1).padStart(2, '0')}`,
            name: long
              ? `${LONG_SUBJECT} ${i + 1}`
              : (SUBJECTS[(i + p) % SUBJECTS.length] ?? 'Sample subject'),
            maximum: '100',
            obtained: String(58 + ((i * 7 + p * 5) % 35)),
          })),
        })),
      });
    case 'PROVISIONAL':
      return academicCertificateInputSchema.parse({
        type,
        ...common,
        programName: long
          ? 'Master of Applied Studies in Sustainable Development and Environmental Policy'
          : 'Master of Applied Studies',
        examinationText: 'final examination held in May 2026 (24-month programme)',
        resultText: 'Passed (sample)',
      });
    case 'CHARACTER':
      return academicCertificateInputSchema.parse({
        type,
        ...common,
        programName: degree,
        studyPeriodText: 'July 2023 to June 2026 (36-month programme)',
      });
    case 'MIGRATION':
      return academicCertificateInputSchema.parse({
        type,
        ...common,
        programName: degree,
        studyPeriodText: 'July 2023 to June 2026 (36-month programme)',
        lastExaminationText: 'the final year examination held in May 2026',
      });
  }
}
