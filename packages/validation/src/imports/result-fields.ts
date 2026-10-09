export const RESULT_IMPORT_FIELD_KEYS = [
  'registrationNumber',
  'subjectCode',
  'internalMarks',
  'externalMarks',
  'practicalMarks',
  'otherMarks',
  'totalMarks',
  'grade',
] as const;

export type ResultImportField = (typeof RESULT_IMPORT_FIELD_KEYS)[number];

export type ResultImportFieldKind = 'text' | 'numeric' | 'code';

export interface ResultImportFieldDefinition {
  key: ResultImportField;
  label: string;
  required: boolean;
  kind: ResultImportFieldKind;
  maxLength?: number;
  description: string;
  example: string;
  aliases: readonly string[];
}

export const RESULT_IMPORT_FIELDS: readonly ResultImportFieldDefinition[] = [
  {
    key: 'registrationNumber',
    label: 'Registration Number',
    required: true,
    kind: 'text',
    maxLength: 64,
    description: 'Official registration number as issued.',
    example: 'DEV-IMPORT-0001',
    aliases: [
      'registration number',
      'registration no',
      'registration num',
      'registration',
      'reg number',
      'reg no',
      'reg num',
      'regn no',
      'regd no',
      'registrationnumber',
      'regno',
    ],
  },
  {
    key: 'subjectCode',
    label: 'Subject Code',
    required: true,
    kind: 'code',
    maxLength: 32,
    description: 'The code of the subject as mapped in the curriculum.',
    example: 'CS101',
    aliases: ['subject code', 'subject', 'sub code', 'course code', 'course'],
  },
  {
    key: 'internalMarks',
    label: 'Internal Marks',
    required: false,
    kind: 'numeric',
    description: 'Marks obtained in internal assessment.',
    example: '45.5',
    aliases: ['internal marks', 'internal', 'int marks', 'int'],
  },
  {
    key: 'externalMarks',
    label: 'External Marks',
    required: false,
    kind: 'numeric',
    description: 'Marks obtained in external/theory assessment.',
    example: '70',
    aliases: ['external marks', 'external', 'ext marks', 'ext', 'theory', 'theory marks'],
  },
  {
    key: 'practicalMarks',
    label: 'Practical Marks',
    required: false,
    kind: 'numeric',
    description: 'Marks obtained in practical assessment.',
    example: '25',
    aliases: ['practical marks', 'practical', 'prac marks', 'prac'],
  },
  {
    key: 'otherMarks',
    label: 'Other Marks',
    required: false,
    kind: 'numeric',
    description: 'Marks obtained in other assessments (e.g. viva, seminar).',
    example: '10',
    aliases: ['other marks', 'other', 'viva', 'seminar'],
  },
  {
    key: 'totalMarks',
    label: 'Total Marks',
    required: false,
    kind: 'numeric',
    description: 'Total marks obtained.',
    example: '85.5',
    aliases: ['total marks', 'total', 'tot marks', 'tot'],
  },
  {
    key: 'grade',
    label: 'Grade',
    required: false,
    kind: 'text',
    maxLength: 8,
    description: 'Letter grade obtained.',
    example: 'A+',
    aliases: ['grade', 'letter grade'],
  },
];

export function resultImportField(key: string): ResultImportFieldDefinition | undefined {
  return RESULT_IMPORT_FIELDS.find((candidate) => candidate.key === key);
}
