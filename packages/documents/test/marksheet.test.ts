import { describe, expect, it } from 'vitest';
import PDFParser, { type Output } from 'pdf2json';
import {
  marksheetPreviewInputSchema,
  marksheetPreviewQuerySchema,
  marksheetTemplateSchema,
} from '@docversity/validation';
import {
  marksheetTemplate,
  marksheetTemplates,
  PREVIEW_FOOTER,
  PREVIEW_WATERMARK,
  renderMarksheetPreview,
  syntheticMarksheet,
} from '../src/index.js';
const template = () => marksheetTemplate('sample-academic', 1);
function subject(input: ReturnType<typeof syntheticMarksheet>, index = 0) {
  const value = input.subjects[index];
  if (!value) throw new Error('Missing synthetic subject');
  return value;
}
function parse(bytes: Buffer): Promise<Output> {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser();
    parser.on('pdfParser_dataReady', (value) => {
      parser.destroy();
      resolve(value);
    });
    parser.on('pdfParser_dataError', (error) => {
      parser.destroy();
      reject(error instanceof Error ? error : error.parserError);
    });
    parser.parseBuffer(bytes, 0);
  });
}
const pageText = (page: Output['Pages'][number]) =>
  page.Texts.flatMap((t) => t.R.map((r) => decodeURIComponent(r.T))).join(' ');
describe('validated preview contract', () => {
  it.each(['semester', 'year', 'stress'] as const)('accepts %s synthetic input', (fixture) => {
    expect(marksheetPreviewInputSchema.parse(syntheticMarksheet(fixture)).kind).toBe(
      'SYNTHETIC_PREVIEW',
    );
  });
  it.each([
    { kind: 'OFFICIAL' },
    { student: {} },
    { institution: {} },
    { issueDate: '2026-01-01' },
    { signatureUrl: 'https://example.test/signature.png' },
    { resultId: 'real-record' },
    { subjects: [] },
    { subjects: Array.from({ length: 81 }, () => syntheticMarksheet('semester').subjects[0]) },
  ])('rejects incomplete, official or excessive input %j', (change) => {
    expect(
      marksheetPreviewInputSchema.safeParse({ ...syntheticMarksheet('semester'), ...change })
        .success,
    ).toBe(false);
  });
  it('rejects malformed registration, overlong text and hidden controls', () => {
    for (const change of [
      { registrationNumber: '../../private' },
      { fullName: 'X'.repeat(101) },
      { fullName: 'Sample\u202eStudent' },
    ]) {
      const input = syntheticMarksheet('semester');
      expect(
        marksheetPreviewInputSchema.safeParse({
          ...input,
          student: { ...input.student, ...change },
        }).success,
      ).toBe(false);
    }
  });
  it.each(['-1', 'NaN', '101', '1.234', '1e2'])('rejects invalid numeric marks %s', (obtained) => {
    const input = syntheticMarksheet('semester');
    subject(input).internal = { maximum: '100', obtained, state: 'RECORDED' };
    expect(marksheetPreviewInputSchema.safeParse(input).success).toBe(false);
  });
  it('preserves zero, withheld and absent values without deriving totals', () => {
    const input = syntheticMarksheet('semester');
    subject(input, 1).external = { maximum: '70', obtained: null, state: 'ABSENT' };
    expect(marksheetPreviewInputSchema.parse(input).subjects[0]?.internal?.obtained).toBe('0');
    expect(input.subjects.every((s) => s.total?.obtained === null)).toBe(true);
    subject(input, 1).external = { maximum: '70', obtained: '0', state: 'ABSENT' };
    expect(marksheetPreviewInputSchema.safeParse(input).success).toBe(false);
  });
  it('rejects unsupported versions, URLs, paths and watermark suppression', () => {
    for (const fixture of ['https://example.test', '../../secret', 'real-student'])
      expect(
        marksheetPreviewQuerySchema.safeParse({
          templateId: 'sample-academic',
          version: 1,
          fixture,
        }).success,
      ).toBe(false);
    expect(() => marksheetTemplate('sample-academic', 2)).toThrow();
    expect(marksheetTemplateSchema.safeParse({ ...template(), watermark: false }).success).toBe(
      false,
    );
    expect(
      marksheetPreviewQuerySchema.safeParse({
        templateId: 'sample-academic',
        version: 2,
        fixture: 'semester',
      }).success,
    ).toBe(false);
    expect(
      marksheetPreviewQuerySchema.safeParse({
        templateId: 'sample-academic',
        version: 1,
        fixture: 'semester',
        studentId: 'arbitrary',
      }).success,
    ).toBe(false);
  });
  it('returns isolated registry values', () => {
    const copy = marksheetTemplates()[0];
    if (!copy) throw new Error('Missing template');
    copy.settings.margin = 54;
    expect(template().settings.margin).toBe(42);
  });
});
describe('production PDF renderer', () => {
  it.each(['semester', 'year', 'stress'] as const)(
    '%s: valid A4 pages, embedded text and mandatory non-official markings',
    async (fixture) => {
      const rendered = await renderMarksheetPreview(syntheticMarksheet(fixture), template());
      expect(rendered.bytes.subarray(0, 5).toString()).toBe('%PDF-');
      const pdf = await parse(rendered.bytes);
      expect(pdf.Pages).toHaveLength(rendered.pages);
      if (fixture !== 'stress') expect(rendered.pages).toBe(1);
      if (fixture === 'stress') expect(rendered.pages).toBeGreaterThan(1);
      for (const [index, page] of pdf.Pages.entries()) {
        expect(page.Width / page.Height).toBeCloseTo(595.28 / 841.89, 3);
        const content = pageText(page);
        expect(content).toContain(PREVIEW_WATERMARK);
        expect(content).toContain(PREVIEW_FOOTER);
        expect(content).toContain(`Page ${index + 1} of ${rendered.pages}`);
        expect(page.Fields).toHaveLength(0);
      }
      const content = pdf.Pages.map(pageText).join(' ');
      expect(content).toContain(fixture === 'semester' ? 'Semester 2' : 'Year 1');
      expect(content).toContain('GPA: Not supplied');
      expect(content).toContain('Withheld');
      expect(content).toContain('0 / 30');
      expect(content).toContain('intentionally blank');
      expect(content).not.toMatch(
        /certificate number|verification token|https?:\/\/|digitally signed/i,
      );
      const expected = syntheticMarksheet(fixture);
      for (const s of expected.subjects) expect(content).toContain(s.code);
    },
  );
  it('produces byte-identical output from identical inputs', async () => {
    const input = syntheticMarksheet('semester');
    const a = await renderMarksheetPreview(input, template());
    const b = await renderMarksheetPreview(input, template());
    expect(a.bytes.equals(b.bytes)).toBe(true);
  });
  it('renders supplied grade/status/summary without calculating a conversion or attempt policy', async () => {
    const input = syntheticMarksheet('semester');
    subject(input).grade = 'SAMPLE';
    subject(input).gradePoint = '2.5';
    input.summary.gpa = '2.5';
    input.summary.percentage = '40';
    input.summary.officialStatus = 'Synthetic status';
    input.examination.attemptLabel = 'Illustrative * label';
    const pdf = await parse((await renderMarksheetPreview(input, template())).bytes);
    const content = pdf.Pages.map(pageText).join(' ');
    expect(content).toContain('Grade: SAMPLE');
    expect(content).toContain('Grade point: 2.5');
    expect(content).toContain('GPA: 2.5');
    expect(content).toContain('Synthetic status');
    expect(input.subjects[0]?.total?.obtained).toBeNull();
  });
});
