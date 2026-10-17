import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import {
  academicCertificateInputSchema,
  academicCertificateTemplateSchema,
  type AcademicCertificateInput,
  type AcademicCertificateTemplate,
} from '@docversity/validation';

const asset = (name: string, mime: string) =>
  `data:${mime};base64,${readFileSync(new URL(`../assets/${name}`, import.meta.url)).toString('base64')}`;
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
const longDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));

const fontFaces = () =>
  `@font-face{font-family:Noto;src:url('${asset('fonts/NotoSans-Regular.ttf', 'font/ttf')}')}@font-face{font-family:Noto;src:url('${asset('fonts/NotoSans-Bold.ttf', 'font/ttf')}');font-weight:700}
@font-face{font-family:Serif;src:url('${asset('training/CrimsonPro.ttf', 'font/ttf')}');font-weight:200 900}`;
const SAMPLE_BANNER =
  'SAMPLE · SYNTHETIC PREVIEW · NOT A UNIVERSITY DOCUMENT · NOT VALID FOR ANY PURPOSE';
const STRUCTURE_LABEL = { SEMESTER_WISE: 'Semester-wise', YEAR_WISE: 'Year-wise' } as const;

function details(rows: [string, string][]) {
  return `<dl class="details">${rows.map(([k, v]) => `<dt>${escape(k)}</dt><dd>${escape(v)}</dd>`).join('')}</dl>`;
}

function body(d: AcademicCertificateInput): string {
  const name = `<strong class="name">${escape(d.studentName)}</strong>`;
  const program = `<em>${escape(d.programName)}</em>`;
  const identity = details([
    ['Name', d.studentName],
    ['Parent / guardian', d.guardianName],
    ['Registration number', d.registrationNumber],
    ['Programme', d.programName],
  ]);
  switch (d.type) {
    case 'COURSE_COMPLETION':
      return `${identity}<p class="statement">This is to certify that ${name} has completed the course</p><p class="course">${escape(d.courseName)}</p><p class="statement">of <strong>${escape(d.durationText)}</strong> duration, conducted from ${escape(d.periodText)}.</p><p class="scope">This certificate records completion of the course named above only. It is not a degree, diploma or provisional certificate and does not state a qualification.</p>`;
    case 'TRANSCRIPT':
      return `${details([
        ['Name', d.studentName],
        ['Registration number', d.registrationNumber],
        ['Programme', d.programName],
        ['Academic session', d.sessionText],
      ])}${d.periods
        .map(
          (p) =>
            `<table><caption>${escape(p.label)}</caption><thead><tr><th scope="col">Code</th><th scope="col">Subject</th><th scope="col" class="num">Maximum</th><th scope="col" class="num">Obtained</th></tr></thead><tbody>${p.subjects
              .map(
                (s) =>
                  `<tr><td class="code">${escape(s.code)}</td><td>${escape(s.name)}</td><td class="num">${escape(s.maximum)}</td><td class="num">${escape(s.obtained)}</td></tr>`,
              )
              .join('')}</tbody></table>`,
        )
        .join(
          '',
        )}<p class="scope">Marks are invented sample values. No grade, GPA, division or overall result is computed in a preview.</p>`;
    case 'PROVISIONAL':
      return `${identity}<p class="statement">This is to certify that ${name} has passed the ${escape(d.examinationText)} for the programme ${program}, with the result <strong>${escape(d.resultText)}</strong>.</p><p class="statement">This provisional certificate is issued pending the formal award of the degree.</p>`;
    case 'CHARACTER':
      return `${identity}<p class="statement">This is to certify that ${name} was a student of this University in the programme ${program} from ${escape(d.studyPeriodText)}.</p><p class="statement">To the best of the University's knowledge, the student bears a good moral character and nothing adverse is on record.</p>`;
    case 'MIGRATION':
      return `${identity}<p class="statement">This is to certify that ${name} was enrolled in the programme ${program} from ${escape(d.studyPeriodText)} and last appeared in ${escape(d.lastExaminationText)}.</p><p class="statement">The University has no objection to the student migrating to another university or institution to continue their studies.</p>`;
  }
}

export function academicCertificateHtml(
  raw: AcademicCertificateInput,
  definition: AcademicCertificateTemplate,
): string {
  const data = academicCertificateInputSchema.parse(raw);
  const template = academicCertificateTemplateSchema.parse(definition);
  if (data.type !== template.type) throw new Error('Sample data does not match the template type.');
  const signatures = template.signatoryTitles
    .map(
      (t) =>
        `<div class="signature"><div class="line" aria-label="Blank signature line">Unsigned · sample</div><span>${escape(t)}</span></div>`,
    )
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'"><title>Sample ${escape(template.title)}</title><style>
${fontFaces()}
@page{size:A4 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;color:#0b2545}body{font-family:Noto,sans-serif;font-variant-ligatures:none;font-feature-settings:'liga' 0,'clig' 0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.paper{width:210mm;height:297mm;padding:9mm;position:relative;overflow:hidden;background:#fff}
.frame{position:absolute;inset:9mm;border:1.2mm solid #0b2545;outline:.3mm solid #b08d57;outline-offset:-2.6mm}
.content{position:relative;z-index:1;padding:13mm 16mm 0;display:flex;flex-direction:column;height:100%}
header{text-align:center}.emblem{width:19mm;height:19mm;margin:0 auto 2mm;border-radius:50%;border:.6mm solid #0b2545;display:flex;align-items:center;justify-content:center;font-family:Serif,serif;font-weight:700;font-size:15pt;letter-spacing:.5pt;box-shadow:inset 0 0 0 1.4mm #fff,inset 0 0 0 1.7mm #b08d57}
.institution{font-family:Serif,serif;font-size:21pt;font-weight:700;margin:0;letter-spacing:.4pt}.fictitious{font-size:7.5pt;color:#5b6675;margin:1mm 0 0;text-transform:uppercase;letter-spacing:1pt}
h1{font-family:Serif,serif;font-size:22pt;font-weight:600;margin:6mm 0 1mm;letter-spacing:1.5pt;text-transform:uppercase}.rule{width:46mm;height:.5mm;background:#b08d57;margin:2mm auto 0}
.meta{display:flex;justify-content:space-between;font-size:8.5pt;margin:6mm 0 4mm;color:#33415c}
.details{display:grid;grid-template-columns:40mm 1fr;gap:1.4mm 4mm;margin:0 0 5mm;font-size:9.5pt;padding:3mm 4mm;border-left:.7mm solid #b08d57;background:#f7f5f0}.details dt{color:#5b6675}.details dd{margin:0;font-weight:700;overflow-wrap:anywhere}
.statement{font-family:Serif,serif;font-size:14pt;line-height:1.55;margin:0 0 3mm;text-align:left;hyphens:manual;text-wrap:pretty}.statement .name{font-size:15pt}
.course{font-family:Serif,serif;font-size:18pt;font-weight:700;font-style:italic;text-align:center;margin:1mm 0 3mm;line-height:1.25}
.scope{font-size:8.5pt;color:#33415c;border-top:.2mm solid #d6d2c4;padding-top:2mm;margin:3mm 0 0}
table{width:100%;border-collapse:collapse;font-size:8.6pt;margin:0 0 3mm}caption{text-align:left;font-weight:700;font-size:9pt;padding:0 0 1mm;color:#0b2545}th{background:#0b2545;color:#fff;font-weight:700;text-align:left;padding:1.3mm 2mm}td{padding:1.1mm 2mm;border-bottom:.2mm solid #e2ded2;vertical-align:top}tbody tr:nth-child(even) td{background:#faf9f6}.num{text-align:right;white-space:nowrap;width:20mm}.code{white-space:nowrap;width:30mm;color:#33415c}
.bottom{margin-top:auto;padding-bottom:22mm;display:flex;align-items:flex-end;justify-content:space-between;gap:8mm}
.verification{width:38mm;height:38mm;border:.4mm dashed #8a94a3;display:flex;align-items:center;justify-content:center;text-align:center;font-size:7pt;line-height:1.35;color:#5b6675;padding:2mm}
.signatures{display:flex;gap:10mm;flex:1;justify-content:flex-end}.signature{width:52mm;text-align:center}.signature .line{height:14mm;border-bottom:.3mm solid #0b2545;display:flex;align-items:flex-end;justify-content:center;font-size:7.5pt;font-style:italic;color:#8a94a3;padding-bottom:1.5mm}.signature span{display:block;font-size:8.5pt;margin-top:1.5mm;font-weight:700}
.footer{position:absolute;left:18mm;right:18mm;bottom:15mm;text-align:center;font-size:7.5pt;font-weight:700;color:#743318;z-index:2}.footer span{display:block;font-weight:400;color:#5b6675;margin-top:.8mm}
.banner{position:absolute;top:3mm;left:0;right:0;text-align:center;font-size:7.5pt;font-weight:700;color:#743318;z-index:3;letter-spacing:.5pt}
.compact .content{padding-top:9mm}.compact .emblem{width:13mm;height:13mm;font-size:11pt;margin-bottom:1mm}.compact .institution{font-size:17pt}.compact h1{font-size:17pt;margin-top:3mm}.compact .meta{margin:3mm 0 2.5mm}.compact .details{grid-template-columns:30mm 1fr 30mm 1fr;font-size:8.5pt;margin-bottom:3mm;padding:2mm 3mm}.compact table{font-size:8pt;margin-bottom:2mm}.compact td{padding:.8mm 2mm}.compact th{padding:1mm 2mm}.compact .verification{width:30mm;height:30mm}.compact .signature .line{height:11mm}
.watermark{position:absolute;left:0;right:0;top:118mm;text-align:center;transform:rotate(-32deg);font-size:96pt;font-weight:700;color:rgba(116,51,24,.11);z-index:2;pointer-events:none;letter-spacing:6pt}
</style></head><body><main class="paper${data.type === 'TRANSCRIPT' ? ' compact' : ''}" data-certificate-type="${template.type}"><div class="banner">SAMPLE · SYNTHETIC PREVIEW · NOT A UNIVERSITY DOCUMENT · NOT VALID FOR ANY PURPOSE</div><div class="frame" aria-hidden="true"></div><div class="watermark" aria-hidden="true">SAMPLE</div><div class="content"><header><div class="emblem" aria-hidden="true">EU</div><p class="institution">${escape(data.institutionName)}</p><p class="fictitious">Fictitious institution · invented record</p><h1>${escape(template.title)}</h1><div class="rule"></div></header><div class="meta"><span>Reference: ${escape(data.certificateReference)}</span><span>Date: ${escape(longDate(data.issueDate))}</span></div>${body(data)}<div class="bottom"><div class="verification">No QR code<br>No verification credential<br>Preview only</div><div class="signatures">${signatures}</div></div></div><footer class="footer">SAMPLE — unsigned, unissued and unverifiable<span>${escape(template.id)} · template v${template.version} · Docversity synthetic preview</span></footer></main></body></html>`;
}

const cssString = (value: string) =>
  `"${value.replace(/[\\"\n]/g, (c) => (c === '\n' ? ' ' : `\\${c}`))}"`;
/** Upper bound for a synthetic multipage preview. */
export const MAX_TRANSCRIPT_PREVIEW_PAGES = 12;

/**
 * Multipage transcript (used only when a transcript does not fit the single-page design). Every page
 * repeats the frame, SAMPLE watermark, SAMPLE banner, non-official footer with page numbers, and each
 * period's table headings; rows never split across pages. No grade, GPA or result is computed.
 */
export function academicTranscriptMultipageHtml(
  raw: AcademicCertificateInput,
  definition: AcademicCertificateTemplate,
): string {
  const data = academicCertificateInputSchema.parse(raw);
  const template = academicCertificateTemplateSchema.parse(definition);
  if (data.type !== 'TRANSCRIPT' || template.type !== 'TRANSCRIPT')
    throw new Error('Only transcripts have a multipage layout.');
  const footer = `SAMPLE — unsigned, unissued and unverifiable · ${data.registrationNumber} · ${template.id} v${template.version} · Page `;
  const tables = data.periods
    .map(
      (p) =>
        `<table><thead><tr class="period"><th colspan="4" scope="colgroup">${escape(p.label)}</th></tr><tr><th scope="col">Code</th><th scope="col">Subject</th><th scope="col" class="num">Maximum</th><th scope="col" class="num">Obtained</th></tr></thead><tbody>${p.subjects
          .map(
            (s) =>
              `<tr><td class="code">${escape(s.code)}</td><td>${escape(s.name)}</td><td class="num">${escape(s.maximum)}</td><td class="num">${escape(s.obtained)}</td></tr>`,
          )
          .join('')}</tbody></table>`,
    )
    .join('');
  const signatures = template.signatoryTitles
    .map(
      (t) =>
        `<div class="signature"><div class="line" aria-label="Blank signature line">Unsigned · sample</div><span>${escape(t)}</span></div>`,
    )
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'"><title>Sample ${escape(template.title)}</title><style>
${fontFaces()}
@page{size:A4 portrait;margin:15mm 0 21mm;
@top-center{content:${cssString(SAMPLE_BANNER)};font-family:Noto,sans-serif;font-variant-ligatures:none;font-feature-settings:'liga' 0,'clig' 0;font-size:7.5pt;font-weight:700;color:#743318;letter-spacing:.5pt}
@bottom-center{content:${cssString(footer)} counter(page) " of " counter(pages);font-family:Noto,sans-serif;font-variant-ligatures:none;font-feature-settings:'liga' 0,'clig' 0;font-size:7.5pt;font-weight:700;color:#743318}}
*{box-sizing:border-box}html,body{margin:0;color:#0b2545}body{font-family:Noto,sans-serif;font-variant-ligatures:none;font-feature-settings:'liga' 0,'clig' 0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.frame{position:fixed;top:0;bottom:0;left:9mm;right:9mm;border:1.2mm solid #0b2545;outline:.3mm solid #b08d57;outline-offset:-2.6mm}
.watermark{position:fixed;left:0;right:0;top:100mm;text-align:center;transform:rotate(-32deg);font-size:96pt;font-weight:700;color:rgba(116,51,24,.11);z-index:2;letter-spacing:6pt}
.flow{position:relative;z-index:1;margin:0 9mm;padding:8mm 16mm;-webkit-box-decoration-break:clone;box-decoration-break:clone}
header{text-align:center}.emblem{width:13mm;height:13mm;margin:0 auto 1mm;border-radius:50%;border:.6mm solid #0b2545;display:flex;align-items:center;justify-content:center;font-family:Serif,serif;font-weight:700;font-size:11pt;box-shadow:inset 0 0 0 1.4mm #fff,inset 0 0 0 1.7mm #b08d57}
.institution{font-family:Serif,serif;font-size:17pt;font-weight:700;margin:0;letter-spacing:.4pt}.fictitious{font-size:7.5pt;color:#5b6675;margin:1mm 0 0;text-transform:uppercase;letter-spacing:1pt}
h1{font-family:Serif,serif;font-size:17pt;font-weight:600;margin:3mm 0 1mm;letter-spacing:1.5pt;text-transform:uppercase}.rule{width:46mm;height:.5mm;background:#b08d57;margin:2mm auto 0}
.meta{display:flex;justify-content:space-between;font-size:8.5pt;margin:3mm 0 2.5mm;color:#33415c}
.details{display:grid;grid-template-columns:30mm 1fr 30mm 1fr;gap:1.4mm 4mm;margin:0 0 4mm;font-size:8.5pt;padding:2mm 3mm;border-left:.7mm solid #b08d57;background:#f7f5f0;break-inside:avoid}.details dt{color:#5b6675}.details dd{margin:0;font-weight:700;overflow-wrap:anywhere}
table{width:100%;border-collapse:collapse;font-size:8.2pt;margin:0 0 4mm}thead{display:table-header-group}tr{break-inside:avoid}
/* Widow/orphan control: a period never starts with fewer than 2 rows or ends with a lone row on a page. */
tbody tr:nth-child(-n+2),tbody tr:nth-last-child(-n+2){break-before:avoid}
th{background:#0b2545;color:#fff;font-weight:700;text-align:left;padding:1mm 2mm}thead .period th{background:#f1ede3;color:#0b2545;font-size:9pt;padding:1.4mm 2mm;border-bottom:.4mm solid #b08d57}
td{padding:.9mm 2mm;border-bottom:.2mm solid #e2ded2;vertical-align:top;overflow-wrap:anywhere}tbody tr:nth-child(even) td{background:#faf9f6}.num{text-align:right;white-space:nowrap;width:20mm}.code{white-space:nowrap;width:32mm;color:#33415c}
.closing{break-inside:avoid;break-before:avoid;padding-top:2mm}.scope{font-size:8.5pt;color:#33415c;border-top:.2mm solid #d6d2c4;padding-top:2mm;margin:0 0 8mm}
.bottom{display:flex;align-items:flex-end;justify-content:space-between;gap:8mm}
.verification{width:30mm;height:30mm;border:.4mm dashed #8a94a3;display:flex;align-items:center;justify-content:center;text-align:center;font-size:7pt;line-height:1.35;color:#5b6675;padding:2mm}
.signatures{display:flex;gap:10mm;flex:1;justify-content:flex-end}.signature{width:52mm;text-align:center}.signature .line{height:11mm;border-bottom:.3mm solid #0b2545;display:flex;align-items:flex-end;justify-content:center;font-size:7.5pt;font-style:italic;color:#8a94a3;padding-bottom:1.5mm}.signature span{display:block;font-size:8.5pt;margin-top:1.5mm;font-weight:700}
</style></head><body data-certificate-type="${template.type}" data-layout="multipage"><div class="frame" aria-hidden="true"></div><div class="watermark" aria-hidden="true">SAMPLE</div><main class="flow"><header><div class="emblem" aria-hidden="true">EU</div><p class="institution">${escape(data.institutionName)}</p><p class="fictitious">Fictitious institution · invented record</p><h1>${escape(template.title)}</h1><div class="rule"></div></header><div class="meta"><span>Reference: ${escape(data.certificateReference)}</span><span>Date: ${escape(longDate(data.issueDate))}</span></div>${details(
    [
      ['Name', data.studentName],
      ['Registration number', data.registrationNumber],
      ['Programme', data.programName],
      ['Academic session', data.sessionText],
      ['Academic structure', STRUCTURE_LABEL[data.structure]],
      ['Periods', String(data.periods.length)],
    ],
  )}${tables}<div class="closing"><p class="scope">Marks are invented sample values. No grade, GPA, division or overall result is computed in a preview.</p><div class="bottom"><div class="verification">No QR code<br>No verification credential<br>Preview only</div><div class="signatures">${signatures}</div></div></div></main></body></html>`;
}

/** Page objects in a Chromium-generated PDF (its page dictionaries are written uncompressed). */
export function pdfPageCount(bytes: Uint8Array): number {
  return (
    Buffer.from(bytes)
      .toString('latin1')
      .match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []
  ).length;
}

export async function renderAcademicCertificatePreview(
  data: AcademicCertificateInput,
  template: AcademicCertificateTemplate,
) {
  const parsed = academicCertificateInputSchema.parse(data);
  const browser = await chromium.launch({ headless: true, timeout: 15_000 });
  const deadline = setTimeout(() => void browser.close(), 45_000);
  try {
    const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' });
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const print = () =>
      page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, tagged: true });
    await page.setContent(academicCertificateHtml(parsed, template), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const fits = await page.evaluate(() => {
      const paper = document.querySelector('.paper'),
        bottom = document.querySelector('.bottom'),
        footer = document.querySelector('.footer'),
        content = document.querySelector('.content');
      if (!paper || !bottom || !footer || !content) return false;
      const signatureBottom = bottom.getBoundingClientRect().bottom - 22 * (96 / 25.4);
      return (
        signatureBottom < footer.getBoundingClientRect().top &&
        content.scrollHeight <= content.clientHeight + 1 &&
        paper.scrollHeight <= paper.clientHeight
      );
    });
    // The approved single-page design is used whenever the document fits it.
    if (fits) return { bytes: await print(), pages: 1, layout: 'SINGLE_PAGE' as const };
    if (parsed.type !== 'TRANSCRIPT')
      throw new Error('Synthetic certificate does not fit its single-page template.');
    await page.setContent(academicTranscriptMultipageHtml(parsed, template), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const bytes = await print();
    const pages = pdfPageCount(bytes);
    if (pages < 2 || pages > MAX_TRANSCRIPT_PREVIEW_PAGES)
      throw new Error('Synthetic transcript produced an unexpected page count.');
    return { bytes, pages, layout: 'MULTIPAGE' as const };
  } finally {
    clearTimeout(deadline);
    await browser.close();
  }
}
