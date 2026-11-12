import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { rejectPopulatedIdentityColumns } from '../src/source-privacy.js';
import { buildWorkbook } from '../src/testing.js';
const limits = { maxUncompressedBytes: 10 * 1024 * 1024 };
describe('student workbook privacy before storage', () => {
  it.each(['TEST-NATIONAL-ID', 123456, 0, false, { formula: '1+1', result: 2 }])(
    'rejects populated identity cells without echoing values: %j',
    async (value) => {
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet('Synthetic');
      sheet.addRow(['Name', 'National Id No.']);
      sheet.addRow(['Test Student', value]);
      await expect(
        rejectPopulatedIdentityColumns(new Uint8Array(await book.xlsx.writeBuffer()), limits),
      ).rejects.toThrow(/Remove national identity/);
    },
  );
  it('checks every worksheet, including hidden sheets and columns', async () => {
    const book = new ExcelJS.Workbook();
    const visible = book.addWorksheet('Data');
    visible.addRow(['Name']);
    visible.addRow(['Test Student']);
    const hidden = book.addWorksheet('Hidden', { state: 'hidden' });
    hidden.addRow(['Passport Number']);
    hidden.addRow(['TEST-PASSPORT']);
    hidden.getColumn(1).hidden = true;
    await expect(
      rejectPopulatedIdentityColumns(new Uint8Array(await book.xlsx.writeBuffer()), limits),
    ).rejects.toThrow(/Remove national identity/);
  });
  it('accepts blank identity columns and preserves the upload buffer exactly', async () => {
    const bytes = await buildWorkbook([
      {
        name: 'Synthetic',
        rows: [
          ['Name', 'Registration No.', 'National Id No.'],
          ['Test Student', 'SYNTH-001', null],
        ],
      },
    ]);
    const before = Buffer.from(bytes);
    await rejectPopulatedIdentityColumns(bytes, limits);
    expect(Buffer.from(bytes)).toEqual(before);
  });
  it('rejects identity-column comments even if the visible value is blank', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Synthetic');
    sheet.addRow(['Name', 'National Id No.']);
    sheet.addRow(['Test Student', '']);
    sheet.getCell('B2').note = 'TEST-ID-NOTE';
    await expect(
      rejectPopulatedIdentityColumns(new Uint8Array(await book.xlsx.writeBuffer()), limits),
    ).rejects.toThrow(/Remove national identity/);
  });
});
