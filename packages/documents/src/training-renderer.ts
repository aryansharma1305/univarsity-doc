import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import QRCode from 'qrcode';
import {
  trainingCertificateInputSchema,
  trainingCertificateTemplateSchema,
  type TrainingCertificateInput,
  type TrainingCertificateTemplate,
} from '@docversity/validation';
const asset = (name: string, mime: string) =>
  `data:${mime};base64,${readFileSync(new URL(`../assets/${name}`, import.meta.url)).toString('base64')}`;
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
export async function trainingCertificateHtml(
  raw: TrainingCertificateInput,
  definition: TrainingCertificateTemplate,
): Promise<string> {
  const data = trainingCertificateInputSchema.parse(raw),
    template = trainingCertificateTemplateSchema.parse(definition);
  const d = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, escape(v)]));
  const c = Object.fromEntries(Object.entries(template.config).map(([k, v]) => [k, escape(v)]));
  const qr = await QRCode.toString(`${data.verificationUrl}?token=${data.qrCode}`, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 4,
  });
  const issueDate = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${data.issueDate}T00:00:00Z`));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'"><title>Sample training certificate</title><style>
 @font-face{font-family:Noto;src:url('${asset('fonts/NotoSans-Regular.ttf', 'font/ttf')}')} @font-face{font-family:Noto;src:url('${asset('fonts/NotoSans-Bold.ttf', 'font/ttf')}');font-weight:700} @font-face{font-family:Certificate;src:url('${asset('training/UnifrakturMaguntia-Book.ttf', 'font/ttf')}')}
 @font-face{font-family:AcademicSerif;src:url('${asset('training/CrimsonPro.ttf', 'font/ttf')}');font-weight:200 900}
 @page{size:A4 portrait;margin:0} *{box-sizing:border-box} html,body{margin:0;color:#071d30} body{font-family:Noto,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact} .paper{width:210mm;height:297mm;padding:10mm 12mm 8mm;position:relative;overflow:hidden;background:radial-gradient(ellipse at 8% 52%,#fff4e8 0,transparent 52%),radial-gradient(ellipse at 97% 91%,#edf5fa 0,transparent 58%),#fff} .content{position:relative;z-index:1;text-align:center} .branding{display:flex;align-items:center;justify-content:center;gap:2mm;height:33mm}.brand{width:93mm;height:auto}.crest{width:28mm;height:auto}h1{font-family:Certificate,serif;font-size:31pt;font-weight:400;margin:6mm 0 3mm;line-height:1.12} .registration{font-family:AcademicSerif,serif;font-weight:bold;font-size:17pt;line-height:1.15}.registration strong{display:block;font-size:14pt;margin-top:1mm}.intro{margin-top:5mm}p{font-size:13pt;line-height:1.45;margin:3mm 0}.name,.course{font-size:19pt;font-weight:700;font-style:italic;color:#111;margin:1mm auto 3mm;line-height:1.2;max-width:175mm}.name{font-size:21pt}.period{font-family:AcademicSerif,serif;font-size:17pt;font-weight:bold;margin:1mm 0}.topics{font-family:AcademicSerif,serif;font-weight:bold;font-size:13.2pt;line-height:1.45;color:#111;margin:1mm 0 2mm}.appreciation{font-size:12pt;margin:3mm auto 0;max-width:160mm}.bottom{display:grid;grid-template-columns:48mm 42mm 1fr;gap:6mm;align-items:center;margin-top:9mm}.seal{width:48mm;height:auto}.qr svg{display:block;width:39mm;height:39mm;margin:auto}.qr p{font-family:AcademicSerif,serif;font-size:11pt;line-height:1.2;margin:1mm 0}.qr .sample-qr{font-family:Noto,sans-serif;font-size:7pt;margin:0}.signature{margin:1mm 0 5mm}.signature-line{border-bottom:.3mm solid #071d30;height:10mm;display:flex;align-items:flex-end;justify-content:center;font-size:8pt;font-style:italic;color:#56616a;padding-bottom:2mm}.signature strong{font-family:AcademicSerif,serif;display:block;font-size:11pt;margin-top:2mm}.signature span{display:block;font-family:AcademicSerif,serif;font-size:10pt;margin-top:1mm}.footer{position:absolute;bottom:9mm;left:12mm;right:12mm;text-align:center;font-size:9pt;z-index:2;font-weight:700}.reference{font-size:8pt;font-weight:400;margin-top:1mm}.watermark{position:absolute;left:17mm;top:127mm;transform:rotate(-32deg);font-size:77pt;font-weight:700;color:rgba(71,85,105,.13);z-index:2;pointer-events:none}.sample-banner{position:absolute;top:2mm;left:0;right:0;text-align:center;font-size:8pt;font-weight:700;color:#743318;z-index:3}.long .name{font-size:18pt}.long .course{font-size:17pt}
 </style></head><body><main class="paper ${data.courseName.length > 40 ? 'long' : ''}"><div class="sample-banner">SAMPLE · SYNTHETIC PREVIEW · NOT VALID FOR ISSUANCE</div><div class="watermark">SAMPLE</div><div class="content"><header class="branding"><img class="brand" src="${asset('training/brand.png', 'image/png')}" alt="Docversity"><img class="crest" src="${asset('training/crest.png', 'image/png')}" alt="University crest — sample preview"></header><h1>Certificate of Training</h1><div class="registration">Registration Number<strong>${d.registrationNumber}</strong></div><p class="intro">${c.bodyIntroText}</p><p class="name">${d.studentName}</p><p>Has successfully completed the certificate in</p><p class="course">${d.courseName}</p><p>With Grade “${d.grade}”</p><p>${c.organizerText}</p><p class="period">${d.coursePeriodText}</p><p>${c.trainingIncludesHeading}</p><p class="topics">${c.trainingTopicsText}</p><p class="appreciation">We appreciate your active participation and dedication to learning</p><div class="bottom"><div><img class="seal" src="${asset('training/seal.png', 'image/png')}" alt="Decorative sample seal"><p style="font-size:7pt">Decorative seal · SAMPLE</p></div><div class="qr">${qr}<p class="sample-qr">SAMPLE QR · example.invalid</p><p><strong>Issue Date:</strong><br>${escape(issueDate)}</p></div><div><div class="signature"><div class="signature-line">Sample signature — unsigned</div><strong>${c.signatoryOneName}</strong><span>${c.signatoryOneTitle}</span></div><div class="signature"><div class="signature-line">Sample signature — unsigned</div><strong>${c.signatoryTwoName}</strong><span>${c.signatoryTwoTitle}</span></div></div></div></div><footer class="footer">${c.verificationFooterText}<div class="reference">${d.certificateReference ?? 'SAMPLE'} · Template v${template.version}</div></footer></main></body></html>`;
}
export async function renderTrainingCertificatePreview(
  data: TrainingCertificateInput,
  template: TrainingCertificateTemplate,
) {
  const html = await trainingCertificateHtml(data, template);
  const browser = await chromium.launch({ headless: true, timeout: 15_000 });
  const deadline = setTimeout(() => void browser.close(), 30_000);
  try {
    const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' });
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const fits = await page.evaluate(() => {
      const paper = document.querySelector('.paper'),
        content = document.querySelector('.content'),
        footer = document.querySelector('.footer');
      if (!paper || !content || !footer) return false;
      return (
        content.getBoundingClientRect().bottom + 8 < footer.getBoundingClientRect().top &&
        paper.scrollHeight <= paper.clientHeight
      );
    });
    if (!fits) throw new Error('Synthetic certificate does not fit its single-page template.');
    return {
      bytes: await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        tagged: true,
      }),
      pages: 1,
    };
  } finally {
    clearTimeout(deadline);
    await browser.close();
  }
}
