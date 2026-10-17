import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { trainingCertificateSample, TRAINING_SAMPLE_SHA256 } from '../src/index.js';

it('serves immutable deterministic sample bytes with the reviewed integrity hash and bounded size', () => {
  const first = trainingCertificateSample();
  expect(first.length).toBeLessThan(1_000_000);
  expect(first.subarray(0, 5).toString()).toBe('%PDF-');
  expect(createHash('sha256').update(first).digest('hex')).toBe(TRAINING_SAMPLE_SHA256);
  first.fill(0);
  expect(createHash('sha256').update(trainingCertificateSample()).digest('hex')).toBe(
    TRAINING_SAMPLE_SHA256,
  );
});
it('contains only the approved fictional one-page sample, watermark and unsigned lines, with no active PDF content', async () => {
  const task = getDocument({
    data: new Uint8Array(trainingCertificateSample()),
    useSystemFonts: false,
  });
  try {
    const pdf = await task.promise;
    expect(pdf.numPages).toBe(1);
    expect(await pdf.getJSActions()).toBeNull();
    expect(await pdf.getAttachments()).toBeNull();
    const page = await pdf.getPage(1);
    expect(await page.getAnnotations()).toEqual([]);
    const text = (await page.getTextContent()).items
      .map((i) => ('str' in i ? i.str : ''))
      .join(' ');
    for (const value of [
      'SAMPLE',
      'SYNTHETIC PREVIEW',
      'NOT VALID FOR ISSUANCE',
      'Alex Sample',
      'SAMPLE-TRAINING-0001',
      'Sample signature',
      'unsigned',
      'No public verification or official certificate issuance',
      'example.invalid',
    ])
      expect(text.replace(/\s+/g, '')).toContain(value.replace(/\s+/g, ''));
    expect(text).not.toContain('verify.thedocversity.com');
  } finally {
    await task.destroy();
  }
});
