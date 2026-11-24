import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { fileURLToPath } from 'node:url';
import { admissionLetterInputSchema } from '@docversity/validation';

const asset = (name: string) => fileURLToPath(new URL(`../assets/${name}`, import.meta.url));

/**
 * Letterhead and fixed wording of the university's admission letter, taken from the sample
 * provisional admission letter the university supplied (24 Nov 2026). Student, course and session
 * values come only from records; nothing here is per-student.
 */
export const ADMISSION_LETTERHEAD = {
  university: 'Docversity University',
  office: 'Admission Office',
  email: 'docversity.admission@gmail.com',
  website: 'www.thedocversity.com',
  phone: '+1 424 2080 796',
  address: [
    'Laxmi Nagar Metro Station',
    'Veer Savarkar Block, Block D,',
    'Laxmi Nagar, New Delhi',
    '110092, India',
  ],
  signatory: 'Admission Director',
} as const;

const ddmmyyyy = (iso: string) => iso.split('-').reverse().join('/');
const titleCase = (value: string) =>
  value.replace(/\b(\w)(\w*)/g, (_, a: string, b: string) => a + b.toLowerCase());
/** PDF standard fonts cover Windows-1252 only; other scripts use the embedded Noto Sans. */
const latin = (value: string) =>
  /^[\u0020-\u007e\u00a0-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022]*$/.test(value);
/**
 * The university's provisional admission letter (A4), from validated, authoritative values only.
 * The verification QR is printed inside the letter; its credential is created when the letter is
 * prepared and only verifies once the letter is issued. No signature, seal or signatory name is
 * drawn: the space above "Admission Director" stays blank for the university's own hand and seal.
 */
export async function renderAdmissionLetter(raw: unknown): Promise<Buffer> {
  const d = admissionLetterInputSchema.parse(raw);
  const L = ADMISSION_LETTERHEAD;
  const stamp = new Date(`${d.issueDate}T00:00:00Z`);
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 40, bottom: 0, left: 62, right: 62 },
    info: {
      Title: `Provisional admission letter ${d.letterNumber}`,
      Author: L.university,
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
  doc.registerFont('Sans', asset('fonts/NotoSans-Regular.ttf'));
  doc.registerFont('SansBold', asset('fonts/NotoSans-Bold.ttf'));
  const W = doc.page.width,
    H = doc.page.height,
    left = 62,
    width = W - 124,
    ink = '#111111',
    navy = '#14243a';
  // Serif like the university's letter; record values outside Latin-1 fall back to Noto Sans.
  const font = (bold: boolean, value = '') =>
    latin(value) ? (bold ? 'Times-Bold' : 'Times-Roman') : bold ? 'SansBold' : 'Sans';

  // Letterhead: logo, university block, institution address.
  doc.image(asset('university-logo.png'), left - 6, 34, { width: 92 });
  doc
    .moveTo(left + 98, 44)
    .lineTo(left + 98, 120)
    .lineWidth(0.6)
    .strokeColor('#9aa3ad')
    .stroke();
  doc
    .fillColor(ink)
    .font('Times-BoldItalic')
    .fontSize(14)
    .text(L.university, left + 106, 46);
  doc.font('Times-Bold').fontSize(9.5);
  for (const row of [L.office, `Email : ${L.email}`, `Website: ${L.website}`, `Phone : ${L.phone}`])
    doc.text(row, { lineGap: 0.5 });
  const rightX = W - 62 - 170;
  doc
    .font(font(true, d.institutionName))
    .fontSize(12.5)
    .text(d.institutionName, rightX, 46, { width: 170, align: 'right' });
  doc.font('Times-Bold').fontSize(8.5);
  for (const row of L.address) doc.text(row, rightX, undefined, { width: 170, align: 'right' });

  // Date and registered letter number.
  let y = 152;
  doc
    .fontSize(11)
    .font('Times-Bold')
    .text(`Date: ${ddmmyyyy(d.issueDate)}`, left + 12, y);
  doc.text(`Letter Regd No.: `, left + 12, y + 18, { continued: true });
  doc.font(font(true, d.letterNumber)).text(d.letterNumber);

  // Title.
  y += 50;
  doc.font('Times-Bold').fontSize(16).text('Provisional', left, y, { width, align: 'center' });
  doc.text('Admission Letter', left, doc.y, { width, align: 'center', underline: true });

  // Addressee: name and nationality from the student record (identity numbers are never stored).
  doc.moveDown(1.2);
  doc.fontSize(10.5).font('Times-Bold').text('To', left);
  doc.font(font(true, d.studentName)).text(d.studentName.toUpperCase());
  doc.font('Times-Bold').text('Nationality: ', { continued: true });
  doc.font(font(true, d.nationality)).text(d.nationality.toUpperCase());

  // Body.
  const para = (parts: [string, boolean][], gap = 0.9) => {
    doc.moveDown(gap);
    parts.forEach(([text, bold], i) => {
      doc.font(font(bold, text)).fontSize(10.5).fillColor(ink);
      const continued = i < parts.length - 1;
      // Wrap options go on the first run only; repeating them restarts the line after a wrap.
      if (i === 0)
        doc.text(text, left, undefined, {
          width,
          // PDFKit cannot justify runs that switch fonts mid-line.
          align: parts.length > 1 ? 'left' : 'justify',
          lineGap: 1.2,
          continued,
        });
      else doc.text(text, { continued });
    });
  };
  const at = d.school ? `${L.university}, ${d.school}` : L.university;
  doc.moveDown(0.6);
  para([
    ['We are pleased to inform you that you have been provisionally admitted to the ', false],
    [d.courseName, true],
    [` program at ${at} for the academic session `, false],
    [`${d.academicSession}.`, true],
  ]);
  // "2 years" -> "2-year" ("a 2-year Postgraduate program").
  const span = d.courseDuration?.replace(
    /^(\d+)\s+(year|month)s?$/i,
    (_, n: string, u: string) => `${n}-${u.toLowerCase()}`,
  );
  const shape = [span, d.courseLevel && titleCase(d.courseLevel)].filter(Boolean).join(' ');
  para([
    [
      'Your admission has been granted based on your academic credentials and fulfillment of the eligibility criteria prescribed by the university. The ',
      false,
    ],
    [d.courseName, true],
    [
      shape
        ? ` program is a ${shape} program designed to provide comprehensive knowledge and practical training in related disciplines.`
        : ' program is designed to provide comprehensive knowledge and practical training in related disciplines.',
      false,
    ],
  ]);

  doc.moveDown(0.9);
  doc
    .font('Times-Bold')
    .fontSize(10.5)
    .text('Program Details:', left, undefined, { underline: true });
  const detail = (label: string, value: string | null, bold = false) => {
    if (!value) return;
    doc.font('Times-Roman').text(`- ${label}: `, left, undefined, { continued: true });
    doc.font(font(bold, value)).text(value);
  };
  detail('Program Name', d.courseName, true);
  detail('Program Level', d.courseLevel && titleCase(d.courseLevel));
  detail('Duration', d.courseDuration && titleCase(d.courseDuration));
  detail('Registration Number', d.registrationNumber);
  detail('Academic Session', d.academicSession);

  para([
    [
      'To confirm your admission, you are required to complete the enrollment process by paying the prescribed admission fees within the stipulated time. Detailed information regarding fee structure, academic calendar, and orientation schedule will be shared separately.',
      false,
    ],
  ]);
  para([
    [
      `We warmly welcome you to ${L.university} and look forward to supporting you in achieving your academic and professional goals in this field.`,
      false,
    ],
  ]);
  para([
    [
      'If you require any further information or assistance, please feel free to contact the Admissions Office email ',
      false,
    ],
    [L.email, true],
  ]);
  para([['Congratulations and best wishes for your future studies.', false]]);

  // Verification QR (left) and signature area (right), above the footer band.
  const blockTop = Math.max(doc.y + 14, H - 218);
  const qrSize = 84;
  if (d.credentialUrl) {
    const png = await QRCode.toBuffer(d.credentialUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 336,
      color: { dark: '#000000', light: '#ffffff' },
    });
    doc.image(png, left, blockTop, { width: qrSize, height: qrSize });
  } else {
    doc
      .rect(left, blockTop, qrSize, qrSize)
      .dash(3, { space: 3 })
      .lineWidth(0.8)
      .strokeColor('#9aa3ad')
      .stroke()
      .undash();
    doc
      .font('Times-Italic')
      .fontSize(8)
      .fillColor('#6b7280')
      .text('Verification QR is added when the letter is prepared', left + 6, blockTop + 28, {
        width: qrSize - 12,
        align: 'center',
      });
  }
  doc
    .font('Times-Roman')
    .fontSize(8)
    .fillColor(ink)
    .text('Scan to verify this letter', left + qrSize + 8, blockTop + 14, { width: 150 });
  doc
    .font('Times-Roman')
    .fontSize(8)
    .text(
      `or visit ${d.verifyUrl.replace(/^https?:\/\//, '')} and enter Letter Regd No. ${d.letterNumber}`,
      {
        width: 150,
      },
    );
  doc
    .font('Times-Italic')
    .fontSize(7.5)
    .fillColor('#4b5563')
    .text('Valid only when signed and sealed by the university.', {
      width: 150,
    });

  const signX = W - 62 - 190;
  doc
    .moveTo(signX + 20, blockTop + 72)
    .lineTo(signX + 190, blockTop + 72)
    .lineWidth(0.8)
    .strokeColor(ink)
    .stroke();
  doc
    .font('Times-Bold')
    .fontSize(11)
    .fillColor(ink)
    .text(L.signatory, signX, blockTop + 78, { width: 190, align: 'right' });
  doc
    .font('Times-Roman')
    .fontSize(7.5)
    .fillColor('#4b5563')
    .text('Signature and seal', signX, blockTop + 94, {
      width: 190,
      align: 'right',
    });

  // Footer band.
  const fy = H - 52;
  doc.rect(0, fy, W * 0.34, 26).fill(navy);
  doc.rect(W * 0.66, fy, W * 0.34, 26).fill(navy);
  doc
    .font('Times-BoldItalic')
    .fontSize(10)
    .fillColor(ink)
    .text(`Web: ${L.website}`, W * 0.34, fy + 8, {
      width: W * 0.32,
      align: 'center',
      lineBreak: false,
    });
  doc
    .font('Times-Roman')
    .fontSize(6.5)
    .fillColor('#6b7280')
    .text(
      `${d.templateName} v${d.templateVersion} · Authority ref. ${d.authorityReference}`,
      left,
      H - 20,
      { width, align: 'center', lineBreak: false },
    );
  doc.end();
  return done;
}
