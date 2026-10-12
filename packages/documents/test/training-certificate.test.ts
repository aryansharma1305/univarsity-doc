import { expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  trainingCertificateInputSchema,
  trainingCertificateTemplateSchema,
  trainingCertificatePreviewQuerySchema,
} from '@docversity/validation';
import {
  trainingCertificateTemplate,
  trainingCertificateTemplates,
  syntheticTrainingCertificate,
  trainingCertificateHtml,
  renderTrainingCertificatePreview,
} from '../src/index.js';
const template = () => trainingCertificateTemplate('sample-training', 1);
it('validates fixed synthetic inputs and immutable versioned template configuration', () => {
  const first = template();
  first.config.bodyIntroText = 'Mutated';
  expect(template().config.bodyIntroText).toBe('This is to certify that');
  expect(trainingCertificateTemplates()).toHaveLength(1);
  expect(() => trainingCertificateTemplate('sample-training', 2)).toThrow();
  expect(() => trainingCertificateTemplate('../../private', 1)).toThrow();
  expect(
    trainingCertificateTemplateSchema.safeParse({ ...template(), status: 'ACTIVE' }).success,
  ).toBe(false);
  expect(
    trainingCertificateTemplateSchema.safeParse({
      ...template(),
      config: { ...template().config, sealAsset: 'https://example.com' },
    }).success,
  ).toBe(false);
  for (const fixture of ['standard', 'long-text'] as const)
    expect(
      trainingCertificateInputSchema.safeParse(syntheticTrainingCertificate(fixture)).success,
    ).toBe(true);
});
it('rejects real identities, URLs, invalid dates and arbitrary HTML/config queries', () => {
  const sample = syntheticTrainingCertificate('standard');
  for (const patch of [
    { kind: 'OFFICIAL' },
    { registrationNumber: '123456789' },
    { verificationUrl: 'https://verify.example.com' },
    { qrCode: 'REAL' },
    { studentName: '<script>x</script>' },
    { issueDate: '2026-02-30' },
  ])
    expect(trainingCertificateInputSchema.safeParse({ ...sample, ...patch }).success).toBe(false);
  for (const patch of [
    { studentId: 'real' },
    { html: '<h1>Fake</h1>' },
    { watermark: false },
    { version: 2 },
    { fixture: 'real' },
    { asset: 'file:///etc/passwd' },
  ])
    expect(
      trainingCertificatePreviewQuerySchema.safeParse({
        templateId: 'sample-training',
        version: 1,
        fixture: 'standard',
        ...patch,
      }).success,
    ).toBe(false);
});
it('renders structured escaped text, a vector sample QR and blank unsigned signature lines', async () => {
  const html = await trainingCertificateHtml(
    { ...syntheticTrainingCertificate('standard'), studentName: 'Sample & Example' },
    template(),
  );
  expect(html).toContain('Sample &amp; Example');
  expect(html).toContain('<svg');
  expect(html).toContain('SAMPLE · SYNTHETIC PREVIEW');
  expect(html).toContain('Sample signature — unsigned');
  expect(html).toContain('example.invalid');
  expect(html).not.toContain('https://verify.example.com');
  expect(template().config.signatoryOneName).toBe('');
  expect(template().config.signatoryTwoName).toBe('');
});
it.each(['standard', 'long-text'] as const)(
  'generates a single-page selectable, watermarked A4 PDF for %s',
  async (fixture) => {
    const rendered = await renderTrainingCertificatePreview(
      syntheticTrainingCertificate(fixture),
      template(),
    );
    expect(rendered.bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(rendered.pages).toBe(1);
    const task = getDocument({ data: new Uint8Array(rendered.bytes), useSystemFonts: false });
    const pdf = await task.promise;
    expect(pdf.numPages).toBe(1);
    const page = await pdf.getPage(1);
    const text = (await page.getTextContent()).items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    expect(text).toContain('SAMPLE');
    expect(text).toContain('SAMPLE-TRAINING-0001');
    expect(text).toContain(syntheticTrainingCertificate(fixture).studentName);
    const viewport = page.getViewport({ scale: 1 });
    expect(viewport.width / viewport.height).toBeCloseTo(210 / 297, 2);
    await task.destroy();
  },
);
