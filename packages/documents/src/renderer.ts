import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import {
  marksheetPreviewInputSchema,
  marksheetTemplateSchema,
  type MarksheetPreviewInput,
} from '@docversity/validation';
export const PREVIEW_WATERMARK = 'SAMPLE — NOT VALID FOR OFFICIAL USE';
export const PREVIEW_FOOTER =
  'Synthetic preview generated for Docversity development. Not an issued university document.';
const fonts = {
  regular: fileURLToPath(new URL('../assets/fonts/NotoSans-Regular.ttf', import.meta.url)),
  bold: fileURLToPath(new URL('../assets/fonts/NotoSans-Bold.ttf', import.meta.url)),
};
const keys = ['internal', 'external', 'practical', 'other', 'total'] as const;
const labels = {
  internal: 'Internal',
  external: 'External',
  practical: 'Practical',
  other: 'Other',
  total: 'Total',
};
type Mark = NonNullable<MarksheetPreviewInput['subjects'][number]['internal']>;
function mark(m: Mark | undefined) {
  if (!m) return '—';
  return `${m.obtained ?? (m.state === 'WITHHELD' ? 'Withheld' : m.state === 'ABSENT' ? 'Absent' : '—')} / ${m.maximum}`;
}
/** No queries, URLs, storage, HTML, signing, policy calculations or caller-selected paths. */
export async function renderMarksheetPreview(
  raw: unknown,
  rawTemplate: unknown,
): Promise<{ bytes: Buffer; pages: number }> {
  const input = marksheetPreviewInputSchema.parse(raw),
    template = marksheetTemplateSchema.parse(rawTemplate);
  if (!template.supportedPeriods.includes(input.period.type))
    throw new Error('Unsupported academic period.');
  const doc = new PDFDocument({
    size: 'A4',
    margin: template.settings.margin,
    bufferPages: true,
    info: {
      Title: 'Synthetic marksheet preview — not an issued document',
      Author: 'Docversity synthetic preview',
      Subject: `${template.id} v${template.version}`,
      CreationDate: new Date('2000-01-01T00:00:00Z'),
      ModDate: new Date('2000-01-01T00:00:00Z'),
    },
  });
  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on('error', (error: Error) => {
      reject(error);
    });
  });
  doc.registerFont('Body', fonts.regular).registerFont('Strong', fonts.bold);
  const margin = template.settings.margin,
    width = doc.page.width - margin * 2;
  const ink = template.settings.headerColor === 'NAVY' ? '#14243a' : '#111111';
  const period = `${input.period.type === 'SEMESTER_WISE' ? 'Semester' : 'Year'} ${input.period.number}`;
  let y = 0;
  function text(
    value: string,
    x: number,
    top: number,
    w: number,
    size = template.settings.bodySize,
    bold = false,
  ) {
    doc
      .font(bold ? 'Strong' : 'Body')
      .fontSize(size)
      .fillColor(ink);
    const h = doc.heightOfString(value, { width: w, lineGap: 2 });
    doc.text(value, x, top, { width: w, lineGap: 2 });
    return h;
  }
  function rule(top: number) {
    doc
      .moveTo(margin, top)
      .lineTo(margin + width, top)
      .lineWidth(0.5)
      .strokeColor('#b7c0cb')
      .stroke();
  }
  function frame(first: boolean) {
    doc.rect(margin, margin, width, 24).lineWidth(0.8).strokeColor(ink).stroke();
    text(PREVIEW_WATERMARK, margin + 8, margin + 6, width - 16, 9, true);
    y = margin + 42;
    y += text(input.institution.name, margin, y, width, first ? 18 : 14, true) + 5;
    y += text(input.institution.officeTitle, margin, y, width, 9) + 3;
    if (first && input.institution.address)
      y += text(input.institution.address, margin, y, width, 8) + 3;
    y += 12;
    y +=
      text(
        first ? 'Statement of marks' : `Statement of marks · ${period} · continued`,
        margin,
        y,
        width,
        first ? 16 : 11,
        true,
      ) + 5;
    if (!first)
      y +=
        text(
          `${input.student.registrationNumber} · ${input.examination.session}`,
          margin,
          y,
          width,
          8,
        ) + 12;
  }
  const bottom = doc.page.height - margin - 80;
  function space(h: number, table = false) {
    if (y + h > bottom) {
      doc.addPage();
      frame(false);
      if (table) tableHeader();
    }
  }
  frame(true);
  const fields: [string, string][] = [
    ['Student', input.student.fullName],
    ['Registration', input.student.registrationNumber],
    ['Program', input.student.programName],
    ['Course', input.student.courseName ?? 'Not supplied'],
    ['Academic batch/session', input.student.academicSession],
    ['Academic level', input.student.academicLevel ?? 'Not supplied'],
    ['Examination session', input.examination.session],
    ['Academic period', `${period} · ${input.period.label}`],
    ['Attempt', input.examination.attemptLabel ?? 'Not supplied'],
    ['Institution identifier', input.institution.identifier ?? 'Not supplied'],
  ];
  y += 12;
  for (let i = 0; i < fields.length; i += 2) {
    let h = 0;
    for (let j = 0; j < 2; j++) {
      const field = fields[i + j];
      if (!field) continue;
      const x = margin + j * (width / 2 + 6),
        w = width / 2 - 16;
      text(field[0], x, y, w, 7.5);
      h = Math.max(h, text(field[1], x, y + 13, w, 9, true));
    }
    y += h + 18;
  }
  y += 8;
  const columns = keys.filter((key) => input.subjects.some((s) => s[key] !== undefined));
  const codeWidth = 66,
    marksWidth = 58,
    nameWidth = width - codeWidth - marksWidth * columns.length;
  function tableHeader() {
    rule(y);
    text('Code', margin + 4, y + 8, codeWidth - 8, 8, true);
    text('Subject', margin + codeWidth + 4, y + 8, nameWidth - 8, 8, true);
    columns.forEach((key, i) =>
      text(
        labels[key],
        margin + codeWidth + nameWidth + i * marksWidth + 4,
        y + 8,
        marksWidth - 8,
        8,
        true,
      ),
    );
    y += 30;
    rule(y);
  }
  space(60);
  tableHeader();
  for (const subject of input.subjects) {
    const note = [
      subject.grade ? `Grade: ${subject.grade}` : '',
      subject.gradePoint != null ? `Grade point: ${subject.gradePoint}` : '',
      subject.officialStatus ? `Status: ${subject.officialStatus}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const title = subject.name + (note ? `\n${note}` : '');
    doc.font('Body').fontSize(template.settings.bodySize);
    const heights = [
      doc.heightOfString(title, { width: nameWidth - 8, lineGap: 2 }),
      doc.heightOfString(subject.code, { width: codeWidth - 8, lineGap: 2 }),
      ...columns.map((key) =>
        doc.heightOfString(mark(subject[key]), { width: marksWidth - 8, lineGap: 2 }),
      ),
    ];
    const h = Math.max(...heights) + template.settings.rowPadding * 2;
    space(h, true);
    text(subject.code, margin + 4, y + template.settings.rowPadding, codeWidth - 8, 8);
    text(title, margin + codeWidth + 4, y + template.settings.rowPadding, nameWidth - 8);
    columns.forEach((key, i) =>
      text(
        mark(subject[key]),
        margin + codeWidth + nameWidth + i * marksWidth + 4,
        y + template.settings.rowPadding,
        marksWidth - 8,
        8,
      ),
    );
    y += h;
    rule(y);
  }
  const summary: { value: string; size: number; bold: boolean; gap: number }[] = [
    { value: 'Result summary · synthetic data only', size: 11, bold: true, gap: 8 },
    {
      value: `Overall marks: ${mark(input.summary.overallMarks)}   ·   GPA: ${input.summary.gpa ?? 'Not supplied'}   ·   Percentage: ${input.summary.percentage ?? 'Not supplied'}`,
      size: 9,
      bold: false,
      gap: 5,
    },
    ...(input.summary.officialStatus
      ? [
          {
            value: `Supplied status: ${input.summary.officialStatus}`,
            size: 9,
            bold: false,
            gap: 5,
          },
        ]
      : []),
    {
      value:
        '— means not supplied. Missing and withheld marks remain distinct from zero. No totals, grades, GPA or academic decisions are calculated.',
      size: 8,
      bold: false,
      gap: 16,
    },
    {
      value: 'Signature / seal area — intentionally blank for this synthetic preview',
      size: 9,
      bold: false,
      gap: 0,
    },
  ];
  const summaryHeight = summary.reduce((height, block) => {
    doc.font(block.bold ? 'Strong' : 'Body').fontSize(block.size);
    return height + doc.heightOfString(block.value, { width, lineGap: 2 }) + block.gap;
  }, 0);
  y += 18;
  space(summaryHeight);
  for (const block of summary)
    y += text(block.value, margin, y, width, block.size, block.bold) + block.gap;
  const pages = doc.bufferedPageRange().count;
  if (pages > 16) {
    doc.destroy();
    throw new Error('Preview page limit exceeded.');
  }
  for (let p = 0; p < pages; p++) {
    doc.switchToPage(p);
    const top = doc.page.height - margin - 48;
    rule(top - 8);
    text(PREVIEW_FOOTER, margin, top, width, 7);
    text(
      `${template.id} · version ${template.version} · PREVIEW ONLY`,
      margin,
      top + 23,
      width - 80,
      7,
    );
    text(`Page ${p + 1} of ${pages}`, margin + width - 80, top + 23, 80, 7);
  }
  doc.end();
  const bytes = await completed;
  if (bytes.length > 2_000_000) throw new Error('Preview size limit exceeded.');
  return { bytes, pages };
}
