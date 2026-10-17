import { describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  academicCertificateInputSchema,
  academicCertificatePreviewQuerySchema,
  academicCertificateTemplateSchema,
  academicCertificateTypeSchema,
  evaluateCourseDuration,
  type AcademicCertificateType,
} from '@docversity/validation';
import {
  academicCertificateHtml,
  academicTranscriptMultipageHtml,
  academicCertificateTemplate,
  academicCertificateTemplates,
  renderAcademicCertificatePreview,
  syntheticAcademicCertificate,
  trainingCertificateTemplates,
} from '../src/index.js';

const TYPES = academicCertificateTypeSchema.options;
/** The synthetic course each type's standard fixture represents (policy-consistent). */
const FIXTURE_COURSE_MONTHS: Record<AcademicCertificateType, number> = {
  COURSE_COMPLETION: 3,
  TRANSCRIPT: 18,
  PROVISIONAL: 24,
  CHARACTER: 36,
  MIGRATION: 36,
};

describe('template registry', () => {
  it('has exactly one immutable preview-only v1 template per academic type, separate from training', () => {
    const all = academicCertificateTemplates();
    expect(all.map((t) => t.type).sort()).toEqual([...TYPES].sort());
    for (const t of all) {
      expect(t.status).toBe('PREVIEW_ONLY');
      expect(t.version).toBe(1);
    }
    const first = all[0];
    if (!first) throw new Error('Missing template');
    first.title = 'Mutated';
    expect(academicCertificateTemplates()[0]?.title).not.toBe('Mutated');
    expect(() => academicCertificateTemplate('MIGRATION', 2)).toThrow();
    expect(trainingCertificateTemplates().map((t) => t.type)).toEqual(['TRAINING_CERTIFICATE']);
    expect(all.some((t) => (t.type as string) === 'TRAINING_CERTIFICATE')).toBe(false);
    expect(
      academicCertificateTemplateSchema.safeParse({ ...all[0], id: 'sample-migration' }).success,
    ).toBe(false);
  });

  it('pairs each standard fixture with a course duration whose policy offers that type', () => {
    for (const type of TYPES)
      expect(
        evaluateCourseDuration(FIXTURE_COURSE_MONTHS[type], 'MONTHS').certificateTypes,
      ).toContain(type);
  });

  it('describes Course Completion as a course record, not a degree', () => {
    const t = academicCertificateTemplate('COURSE_COMPLETION', 1);
    expect(t.description).toMatch(/not a degree/);
    const html = academicCertificateHtml(
      syntheticAcademicCertificate('COURSE_COMPLETION', 'standard'),
      t,
    );
    expect(html).toContain('It is not a degree, diploma or provisional certificate');
    expect(html).not.toMatch(/conferred|degree of|graduat/i);
  });
});

describe('html safety', () => {
  it('escapes text, never embeds a QR/token/URL and refuses mismatched types', () => {
    const data = {
      ...syntheticAcademicCertificate('CHARACTER', 'standard'),
      studentName: 'Sample & Example',
    };
    const html = academicCertificateHtml(data, academicCertificateTemplate('CHARACTER', 1));
    expect(html).toContain('Sample &amp; Example');
    expect(html).not.toMatch(/<svg|https?:\/\/|token=|example\.invalid/);
    expect(html).toContain('No verification credential');
    expect(html).toContain('Unsigned · sample');
    expect(() =>
      academicCertificateHtml(
        syntheticAcademicCertificate('CHARACTER', 'standard'),
        academicCertificateTemplate('MIGRATION', 1),
      ),
    ).toThrow('does not match');
  });
});

describe('PDF rendering', () => {
  const cases = TYPES.flatMap((type) =>
    (['standard', 'long-text'] as const).map((f) => [type, f] as const),
  );
  it.each(cases)(
    'renders %s (%s) as a single watermarked, selectable A4 page',
    async (type, fixture) => {
      const data = syntheticAcademicCertificate(type, fixture);
      const rendered = await renderAcademicCertificatePreview(
        data,
        academicCertificateTemplate(type, 1),
      );
      expect(rendered.bytes.subarray(0, 5).toString()).toBe('%PDF-');
      const task = getDocument({ data: new Uint8Array(rendered.bytes), useSystemFonts: false });
      const pdf = await task.promise;
      expect(pdf.numPages).toBe(1);
      const page = await pdf.getPage(1);
      const text = (await page.getTextContent()).items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ');
      // Text extraction spacing differs by platform (letter-spaced text and wrapped identifiers
      // are split differently on Linux and macOS), so compare without layout whitespace.
      const flat = text.replace(/\s+/g, '');
      const has = (phrase: string) => flat.includes(phrase.replace(/\s+/g, ''));
      for (const phrase of [
        'SAMPLE · SYNTHETIC PREVIEW · NOT A UNIVERSITY DOCUMENT · NOT VALID FOR ANY PURPOSE',
        'SAMPLE — unsigned, unissued and unverifiable',
        'Example University of Learning',
        'No verification credential',
        data.registrationNumber,
      ])
        expect(has(phrase), phrase).toBe(true);
      expect(flat).not.toMatch(/https?:\/\//);
      const viewport = page.getViewport({ scale: 1 });
      expect(viewport.width / viewport.height).toBeCloseTo(210 / 297, 2);
      await task.destroy();
    },
  );
});

describe('multipage transcript', () => {
  async function pagesOf(bytes: Uint8Array) {
    const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false });
    const pdf = await task.promise;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const { width, height } = page.getViewport({ scale: 1 });
      const items = (await page.getTextContent()).items.flatMap((item) =>
        'str' in item && item.str.trim()
          ? [
              {
                str: item.str,
                x: item.transform[4] as number,
                y: item.transform[5] as number,
                w: item.width,
              },
            ]
          : [],
      );
      pages.push({
        width,
        height,
        items,
        text: items.map((i) => i.str).join(' '),
        // pdf.js may split one run into adjacent items; compare without layout whitespace.
        flat: items
          .map((i) => i.str)
          .join('')
          .replace(/\s+/g, ''),
      });
    }
    await task.destroy();
    return pages;
  }

  it('keeps the approved single-page design for transcripts that fit', async () => {
    for (const fixture of ['standard', 'long-text'] as const) {
      const r = await renderAcademicCertificatePreview(
        syntheticAcademicCertificate('TRANSCRIPT', fixture),
        academicCertificateTemplate('TRANSCRIPT', 1),
      );
      expect(r).toMatchObject({ layout: 'SINGLE_PAGE', pages: 1 });
    }
  });

  it.each([
    ['stress-semester', 'Semester', 'Semester-wise', 8, 8],
    ['stress-year', 'Year', 'Year-wise', 4, 14],
  ] as const)(
    '%s spans at least three A4 pages with every page marked, numbered and headed',
    async (fixture, periodWord, structureLabel, periods, perPeriod) => {
      const data = syntheticAcademicCertificate('TRANSCRIPT', fixture);
      const r = await renderAcademicCertificatePreview(
        data,
        academicCertificateTemplate('TRANSCRIPT', 1),
      );
      expect(r.layout).toBe('MULTIPAGE');
      expect(r.pages).toBeGreaterThanOrEqual(3);
      const pages = await pagesOf(r.bytes);
      expect(pages).toHaveLength(r.pages);
      const codes: string[] = [];
      pages.forEach((page, i) => {
        expect(page.width / page.height).toBeCloseTo(210 / 297, 2);
        expect(page.flat).toContain(
          'SAMPLE · SYNTHETIC PREVIEW · NOT A UNIVERSITY DOCUMENT'.replace(/\s+/g, ''),
        );
        expect(page.flat).toContain(
          'SAMPLE — unsigned, unissued and unverifiable'.replace(/\s+/g, ''),
        );
        expect(page.flat).toContain(`Page${i + 1}of${r.pages}`);
        expect(page.text).toContain('SAMPLE');
        const rows = page.items.filter((t) => /^SAMPLE-[SY]\d+-\d{2}$/.test(t.str));
        if (rows.length) {
          // Table headings repeat on every page that carries rows, with the period label.
          for (const heading of ['Code', 'Subject', 'Maximum', 'Obtained'])
            expect(page.items.some((t) => t.str === heading)).toBe(true);
          expect(page.items.some((t) => new RegExp(`^${periodWord} \\d+$`).test(t.str))).toBe(true);
        }
        // Rows never overlap: subject codes are separated by at least one text line.
        const ys = rows.map((t) => t.y).sort((a, b) => b - a);
        for (let k = 1; k < ys.length; k++)
          expect((ys[k - 1] ?? 0) - (ys[k] ?? 0)).toBeGreaterThan(8);
        // Nothing is drawn outside the page.
        for (const t of page.items) {
          expect(t.x).toBeGreaterThanOrEqual(0);
          expect(t.x + t.w).toBeLessThanOrEqual(page.width + 0.5);
          expect(t.y).toBeGreaterThan(0);
          expect(t.y).toBeLessThan(page.height);
        }
        codes.push(...rows.map((t) => t.str));
      });
      // Every subject appears exactly once, in order: no lost, duplicated or reordered rows.
      const expected =
        data.type === 'TRANSCRIPT'
          ? data.periods.flatMap((p) => p.subjects.map((s) => s.code))
          : [];
      expect(expected).toHaveLength(periods * perPeriod);
      expect(codes).toEqual(expected);
      const all = pages.map((p) => p.text).join(' ');
      expect(all).toContain(structureLabel);
      expect(all).not.toContain(periodWord === 'Year' ? 'Semester' : 'Year ');
      // Signatures stay blank and nothing is computed: no totals, GPA, percentage or division.
      expect(all).toContain('Unsigned · sample');
      expect(all).not.toMatch(/\bTotal\b|Percentage|CGPA|GPA:|Division:|Result:/);
      expect(all).not.toMatch(/https?:\/\//);
    },
  );

  it('never orphans the closing section or strands a single row of a period on a page', async () => {
    const base = syntheticAcademicCertificate('TRANSCRIPT', 'stress-semester');
    if (base.type !== 'TRANSCRIPT') throw new Error('unexpected');
    const periods = base.periods;
    // Sweep transcript lengths so page breaks fall at many different positions.
    for (let count = 4; count <= 12; count++) {
      const data = academicCertificateInputSchema.parse({
        ...base,
        periods: Array.from({ length: count }, (_, i) => {
          const source = periods[i % periods.length];
          if (!source) throw new Error('unexpected');
          return {
            label: `Semester ${i + 1}`,
            subjects: source.subjects.map((sub, k) => ({
              ...sub,
              code: `SAMPLE-S${i + 1}-${String(k + 1).padStart(2, '0')}`,
            })),
          };
        }),
      });
      const r = await renderAcademicCertificatePreview(
        data,
        academicCertificateTemplate('TRANSCRIPT', 1),
      );
      if (r.layout === 'SINGLE_PAGE') continue;
      const pages = await pagesOf(r.bytes);
      const codesOn = (page: (typeof pages)[number]) =>
        page.items.filter((t) => /^SAMPLE-S\d+-\d{2}$/.test(t.str)).map((t) => t.str);
      const closing = pages.findIndex((p) => p.flat.includes('Marksareinventedsamplevalues'));
      expect(closing, `closing section present (${count} semesters)`).toBe(pages.length - 1);
      const last = pages[closing];
      if (!last) throw new Error('unexpected');
      // The closing section shares its page with academic rows instead of standing alone.
      expect(
        codesOn(last).length,
        `rows beside closing (${count} semesters)`,
      ).toBeGreaterThanOrEqual(2);
      for (const page of pages) {
        const perPeriod = new Map<string, number>();
        for (const code of codesOn(page)) {
          const period = code.split('-')[1] ?? '';
          perPeriod.set(period, (perPeriod.get(period) ?? 0) + 1);
        }
        for (const [period, n] of perPeriod)
          expect(n, `${period} rows on one page (${count} semesters)`).toBeGreaterThanOrEqual(2);
      }
      expect(pages.flatMap(codesOn)).toEqual(
        data.type === 'TRANSCRIPT'
          ? data.periods.flatMap((p) => p.subjects.map((x) => x.code))
          : [],
      );
    }
  });

  it('refuses mismatched structures, oversized transcripts and stress samples for other types', () => {
    const base = syntheticAcademicCertificate('TRANSCRIPT', 'standard');
    expect(
      academicCertificateInputSchema.safeParse({ ...base, structure: 'YEAR_WISE' }).success,
    ).toBe(false);
    if (base.type !== 'TRANSCRIPT') throw new Error('unexpected');
    const period = base.periods[0];
    if (!period) throw new Error('unexpected');
    const many = Array.from({ length: 13 }, (_, i) => ({ ...period, label: `Semester ${i + 1}` }));
    expect(academicCertificateInputSchema.safeParse({ ...base, periods: many }).success).toBe(
      false,
    );
    expect(() => syntheticAcademicCertificate('MIGRATION', 'stress-year')).toThrow('Unsupported');
    expect(
      academicCertificatePreviewQuerySchema.safeParse({
        type: 'CHARACTER',
        version: '1',
        fixture: 'stress-semester',
      }).success,
    ).toBe(false);
    expect(
      academicCertificatePreviewQuerySchema.safeParse({
        type: 'TRANSCRIPT',
        version: '1',
        fixture: 'stress-semester',
      }).success,
    ).toBe(true);
    expect(() =>
      academicTranscriptMultipageHtml(
        syntheticAcademicCertificate('CHARACTER', 'standard'),
        academicCertificateTemplate('CHARACTER', 1),
      ),
    ).toThrow('Only transcripts');
  });
});
