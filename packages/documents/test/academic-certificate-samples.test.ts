import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  ACADEMIC_SAMPLE_PINS,
  AcademicSampleIntegrityError,
  academicCertificateSample,
  academicCertificateTemplate,
  renderAcademicCertificatePreview,
  syntheticAcademicCertificate,
  verifyAcademicSample,
} from '../src/index.js';

const SAMPLES = Object.entries(ACADEMIC_SAMPLE_PINS) as [
  keyof typeof ACADEMIC_SAMPLE_PINS,
  (typeof ACADEMIC_SAMPLE_PINS)[keyof typeof ACADEMIC_SAMPLE_PINS],
][];
const shipped = (id: string) =>
  readFileSync(new URL(`../assets/samples/academic/${id}.pdf`, import.meta.url));

/** Rounded numbers keep the fingerprint stable while still catching layout and colour changes. */
function normalise(value: unknown): unknown {
  if (typeof value === 'number') return Math.round(value * 100) / 100;
  // pdf.js names loaded fonts per document (g_d0_f1, g_d1_f1…); compare the font, not the load order.
  if (typeof value === 'string') return value.replace(/^g_d\d+_/, 'g_');
  if (typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value) || ArrayBuffer.isView(value))
    return Array.from(value as ArrayLike<unknown>).map(normalise);
  return typeof value;
}

/** Platform the pinned files were rendered on (Chromium's text shaping differs by OS). */
const PINS_RENDERED_ON = 'darwin';
const TEXT_OPS = new Set([
  OPS.beginText,
  OPS.endText,
  OPS.setFont,
  OPS.setTextMatrix,
  OPS.showText,
  OPS.moveText,
  OPS.beginMarkedContentProps,
  OPS.endMarkedContent,
  OPS.dependency,
]);

/**
 * Rendering fingerprint. `portable` holds what a template change alters on every platform: page
 * geometry, the text on each page, the colour palette and the sequence of non-text drawing operators
 * (paths, clips, transforms, graphics state, images). `exact` adds the full operator sequence, all
 * arguments (positions to 0.01 pt) and every placed text run, which only the platform that
 * rendered the pins reproduces.
 */
async function fingerprint(bytes: Uint8Array) {
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false });
  const pdf = await task.promise;
  const portable = [];
  const exact = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const { width, height } = page.getViewport({ scale: 1 });
    const ops = await page.getOperatorList();
    const items = (await page.getTextContent()).items.flatMap((item) =>
      'str' in item && item.str.trim() ? [item] : [],
    );
    const drawing = Array.from(ops.fnArray).filter((fn) => !TEXT_OPS.has(fn));
    portable.push({
      width: normalise(width),
      height: normalise(height),
      text: items
        .map((item) => item.str)
        .join('')
        .replace(/\s+/g, ''),
      palette: [
        ...new Set(
          ops.fnArray.flatMap((fn, i) =>
            fn === OPS.setFillRGBColor || fn === OPS.setStrokeRGBColor
              ? [String((ops.argsArray[i] as unknown[])[0])]
              : [],
          ),
        ),
      ].sort(),
      drawingHash: createHash('sha256').update(JSON.stringify(drawing)).digest('hex'),
    });
    exact.push({
      operators: ops.fnArray.length,
      operatorHash: createHash('sha256')
        .update(JSON.stringify(Array.from(ops.fnArray)))
        .digest('hex'),
      argumentHash: createHash('sha256')
        .update(JSON.stringify(ops.argsArray.map(normalise)))
        .digest('hex'),
      text: items.map((item) => [
        item.str,
        normalise(item.transform[4]),
        normalise(item.transform[5]),
        normalise(item.height),
      ]),
    });
  }
  await task.destroy();
  return { portable, exact };
}

describe('pinned academic samples', () => {
  it.each(SAMPLES)('%s loads as the pinned, verified bytes and returns a copy', (id, pin) => {
    const bytes = academicCertificateSample(id, pin.certificateType);
    expect(bytes.length).toBe(pin.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(pin.sha256);
    bytes.fill(0);
    expect(academicCertificateSample(id, pin.certificateType).subarray(0, 5).toString()).toBe(
      '%PDF-',
    );
  });

  it('fails closed on unknown identifiers, type mismatches and tampered bytes', () => {
    const fail = (fn: () => unknown, check: string) => {
      try {
        fn();
      } catch (error) {
        expect(error).toBeInstanceOf(AcademicSampleIntegrityError);
        expect((error as AcademicSampleIntegrityError).check).toBe(check);
        // Diagnostics name the sample and the failed check only.
        expect((error as Error).message).toMatch(
          /^Academic sample ([\w-]+|\(unknown\)) failed its [\w-]+ check\.$/,
        );
        return;
      }
      throw new Error('expected an integrity failure');
    };
    const id = 'sample-transcript-v1';
    const good = shipped(id);
    fail(() => academicCertificateSample('sample-training-v1', 'TRANSCRIPT'), 'unknown-sample');
    fail(() => academicCertificateSample('../../etc/passwd', 'TRANSCRIPT'), 'unknown-sample');
    fail(() => academicCertificateSample(id, 'MIGRATION'), 'type-mismatch');
    fail(() => verifyAcademicSample(id, 'TRANSCRIPT', good.subarray(1)), 'size');
    fail(() => verifyAcademicSample(id, 'TRANSCRIPT', Buffer.alloc(1024 * 1024)), 'size');
    const header = Buffer.from(good);
    header.write('XXXXX', 0, 'latin1');
    fail(() => verifyAcademicSample(id, 'TRANSCRIPT', header), 'header');
    const flipped = Buffer.from(good);
    flipped[flipped.length - 100] = (flipped[flipped.length - 100] ?? 0) ^ 0xff;
    fail(() => verifyAcademicSample(id, 'TRANSCRIPT', flipped), 'sha256');
    // Another sample's (valid) bytes never verify under a different identity.
    fail(() => verifyAcademicSample(id, 'TRANSCRIPT', shipped('sample-character-v1')), 'size');
    expect(verifyAcademicSample(id, 'TRANSCRIPT', good)).toBe(good);
  });
});

describe('academic sample content', () => {
  it.each(SAMPLES)(
    '%s is fictional, unsigned, unverifiable and marked SAMPLE on every page',
    async (id) => {
      const task = getDocument({ data: new Uint8Array(shipped(id)), useSystemFonts: false });
      const pdf = await task.promise;
      for (let n = 1; n <= pdf.numPages; n++) {
        const items = (await (await pdf.getPage(n)).getTextContent()).items.map((i) =>
          'str' in i ? i.str : '',
        );
        const flat = items.join('').replace(/\s+/g, '');
        const has = (phrase: string) => flat.includes(phrase.replace(/\s+/g, ''));
        expect(
          has('SAMPLE · SYNTHETIC PREVIEW · NOT A UNIVERSITY DOCUMENT · NOT VALID FOR ANY PURPOSE'),
        ).toBe(true);
        expect(has('SAMPLE — unsigned, unissued and unverifiable')).toBe(true);
        expect(has('Example University of Learning')).toBe(true);
        expect(has('No QR code')).toBe(true);
        expect(has('No verification credential')).toBe(true);
        expect(has('Unsigned · sample')).toBe(true);
        expect(has('Alex Sample')).toBe(true);
        // No links, tokens or verification URLs of any kind.
        expect(flat).not.toMatch(/https?:|www\.|token=|\/verify/i);
        // Every identifier-shaped value is a SAMPLE- placeholder; no real registration numbers.
        for (const word of items.join(' ').split(/\s+/))
          if (/^[A-Z]{2,}[-/]\d/.test(word)) expect(word.startsWith('SAMPLE-')).toBe(true);
        // No computed academic result.
        expect(flat).not.toMatch(/GPA:|CGPA|Division:|Total:|Percentage/);
      }
      const annotations = await (await pdf.getPage(1)).getAnnotations();
      expect(
        annotations.filter((a) => (a as { subtype?: string }).subtype === 'Link'),
      ).toHaveLength(0);
      await task.destroy();
    },
  );
});

describe('drift check', () => {
  it.each(SAMPLES)(
    '%s matches a fresh render of its approved template (geometry, text, palette, drawing operators)',
    async (id, pin) => {
      const fresh = await renderAcademicCertificatePreview(
        syntheticAcademicCertificate(pin.certificateType, 'standard'),
        academicCertificateTemplate(pin.certificateType, 1),
      );
      const [expected, actual] = [await fingerprint(shipped(id)), await fingerprint(fresh.bytes)];
      expect(actual.portable).toEqual(expected.portable);
      // Operator-for-operator equality, including every placed text run, on the pinning platform.
      if (process.platform === PINS_RENDERED_ON) expect(actual.exact).toEqual(expected.exact);
    },
  );
});

describe('drift check sensitivity', () => {
  it('detects a change to the rendered content on every platform', async () => {
    const altered = await renderAcademicCertificatePreview(
      { ...syntheticAcademicCertificate('CHARACTER', 'standard'), studentName: 'Alex Samplf' },
      academicCertificateTemplate('CHARACTER', 1),
    );
    const [expected, actual] = [
      await fingerprint(shipped('sample-character-v1')),
      await fingerprint(altered.bytes),
    ];
    expect(actual.portable).not.toEqual(expected.portable);
    if (process.platform === PINS_RENDERED_ON) expect(actual.exact).not.toEqual(expected.exact);
  });
});
