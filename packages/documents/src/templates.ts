import { marksheetTemplateSchema, type MarksheetTemplate } from '@docversity/validation';
const template = marksheetTemplateSchema.parse({
  id: 'sample-academic',
  version: 1,
  status: 'PREVIEW_ONLY',
  name: 'Academic statement · development sample',
  supportedPeriods: ['SEMESTER_WISE', 'YEAR_WISE'],
  settings: {
    pageSize: 'A4',
    margin: 42,
    bodySize: 9,
    rowPadding: 6,
    font: 'NOTO_SANS',
    headerColor: 'NAVY',
  },
});
/** Return validated copies: callers cannot mutate the versioned registry. */
export function marksheetTemplates(): MarksheetTemplate[] {
  return [marksheetTemplateSchema.parse(template)];
}
export function marksheetTemplate(id: string, version: number): MarksheetTemplate {
  if (id !== template.id || version !== template.version)
    throw new Error('Unsupported preview template version.');
  return marksheetTemplateSchema.parse(template);
}
