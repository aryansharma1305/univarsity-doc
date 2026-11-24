import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import { admissionLetterInputSchema } from '@docversity/validation';

const asset = (name: string) => fileURLToPath(new URL(`../assets/${name}`, import.meta.url));
const longDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));

/**
 * A4 admission letter from validated, authoritative values only. No signature, seal, signatory
 * name or approval date is drawn: the signature area stays blank for the university's own hand.
 * The verification QR is issued separately (the PDF is hash-pinned before issue).
 */
export async function renderAdmissionLetter(raw: unknown): Promise<Buffer> {
  const d = admissionLetterInputSchema.parse(raw);
  const stamp = new Date(`${d.issueDate}T00:00:00Z`);
  const doc = new PDFDocument({
    size: 'A4',
    margin: 56,
    info: {
      Title: `Admission letter ${d.letterNumber}`,
      Author: d.institutionName,
      Subject: `${d.templateName} v${d.templateVersion}`,
      CreationDate: stamp,
      ModDate: stamp,
    },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on('error', reject);
  });
  doc.registerFont('Body', asset('fonts/NotoSans-Regular.ttf'));
  doc.registerFont('Strong', asset('fonts/NotoSans-Bold.ttf'));
  const left = 56,
    width = doc.page.width - 112,
    ink = '#14243a',
    muted = '#4b5563';

  doc.image(asset('university-logo.png'), doc.page.width / 2 - 36, 40, { width: 72 });
  doc.font('Strong').fontSize(16).fillColor(ink);
  doc.text(d.institutionName, left, 122, { width, align: 'center' });
  doc
    .font('Strong')
    .fontSize(12.5)
    .text('ADMISSION LETTER', { width, align: 'center', characterSpacing: 2 });
  const rule = doc.y + 8;
  doc
    .moveTo(left, rule)
    .lineTo(left + width, rule)
    .lineWidth(1)
    .strokeColor(ink)
    .stroke();

  doc.font('Body').fontSize(10.5).fillColor(ink);
  const meta = rule + 14;
  doc.text(`Letter No.: ${d.letterNumber}`, left, meta, { width: width / 2 });
  doc.text(`Date: ${longDate(d.issueDate)}`, left + width / 2, meta, {
    width: width / 2,
    align: 'right',
  });

  doc.moveDown(2);
  doc.text('To,', left);
  doc.font('Strong').text(d.studentName);
  doc.font('Body').text(`Registration No.: ${d.registrationNumber}`);
  doc.moveDown(1.2);
  doc.font('Strong').text(`Subject: Admission to ${d.courseName}`);
  doc.moveDown(0.8);
  const offeredBy = d.school ? `the ${d.school}` : d.institutionName;
  const effective = d.admissionDate ? ` with effect from ${longDate(d.admissionDate)}` : '';
  doc
    .font('Body')
    .text(
      `We are pleased to confirm that ${d.studentName} has been admitted to the ${d.courseName}, offered by ${offeredBy}, for the academic session ${d.academicSession}${effective}.`,
      { width, align: 'justify', lineGap: 2 },
    );
  doc.moveDown(1);

  const rows: [string, string | null][] = [
    ['Student Name', d.studentName],
    ['Nationality', d.nationality],
    ['Registration Number', d.registrationNumber],
    ['Course Name', d.courseName],
    ['Course Level', d.courseLevel],
    ['Course Duration', d.courseDuration],
    ['School / Department', d.school],
    ['Academic Session', d.academicSession],
    ['Admission Date', d.admissionDate && longDate(d.admissionDate)],
  ];
  const labelWidth = 170;
  let y = doc.y + 4;
  doc
    .moveTo(left, y)
    .lineTo(left + width, y)
    .lineWidth(0.5)
    .strokeColor('#c7ced8')
    .stroke();
  for (const [label, value] of rows) {
    if (!value) continue;
    const height =
      Math.max(
        doc.font('Body').heightOfString(label, { width: labelWidth - 12 }),
        doc.font('Strong').heightOfString(value, { width: width - labelWidth - 12 }),
      ) + 12;
    doc
      .font('Body')
      .fillColor(muted)
      .text(label, left + 6, y + 6, { width: labelWidth - 12 });
    doc
      .font('Strong')
      .fillColor(ink)
      .text(value, left + labelWidth, y + 6, { width: width - labelWidth - 12 });
    y += height;
    doc
      .moveTo(left, y)
      .lineTo(left + width, y)
      .lineWidth(0.5)
      .strokeColor('#c7ced8')
      .stroke();
  }

  doc.font('Body').fontSize(10).fillColor(ink);
  doc.text(
    `This letter is issued under authority reference ${d.authorityReference}.`,
    left,
    y + 16,
    { width },
  );
  doc.moveDown(0.6);
  doc
    .fillColor(muted)
    .text(
      `Its authenticity can be checked at ${d.verifyUrl} with the letter number, or with the verification QR code issued with this letter.`,
      { width },
    );
  doc.moveDown(0.6);
  doc.fillColor(ink).text('This letter is valid only when signed and sealed by the university.', {
    width,
  });

  // Signature block and footer sit in the bottom margin; never let them start a new page.
  doc.page.margins.bottom = 0;
  const sign = Math.min(Math.max(doc.y + 28, doc.page.height - 210), doc.page.height - 160);
  doc.fillColor(ink).font('Body').fontSize(10.5);
  doc.text(`For ${d.institutionName}`, left + width - 220, sign, { width: 220, align: 'right' });
  doc
    .moveTo(left + width - 200, sign + 64)
    .lineTo(left + width, sign + 64)
    .lineWidth(0.75)
    .strokeColor(ink)
    .stroke();
  doc.text('Authorised Signatory', left + width - 220, sign + 70, { width: 220, align: 'right' });
  doc
    .font('Body')
    .fontSize(8.5)
    .fillColor(muted)
    .text('Signature and seal of the issuing authority', left + width - 220, sign + 86, {
      width: 220,
      align: 'right',
    });

  doc.font('Body').fontSize(8).fillColor(muted);
  doc.text(
    `${d.templateName} v${d.templateVersion} · Letter No. ${d.letterNumber}`,
    left,
    doc.page.height - 48,
    { width, align: 'center', lineBreak: false },
  );
  doc.end();
  return done;
}
