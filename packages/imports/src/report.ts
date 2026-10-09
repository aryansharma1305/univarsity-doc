import ExcelJS from 'exceljs';
import { type ImportIssue, studentImportField, type StudentImportField } from '@docversity/validation';
import { escapeSpreadsheetText } from './safety.js';

export interface ReportRow {
  rowNumber: number;
  registrationNumber: string | null;
  fullName: string | null;
  status: string;
  action: string | null;
  errors: readonly ImportIssue[];
  warnings: readonly ImportIssue[];
}

export interface ReportSummary {
  filename: string;
  worksheet: string;
  generatedAt: Date;
  counts: Record<string, number>;
}

const RED = 'FFFDE8E8';
const AMBER = 'FFFFF6E0';

function text(value: string | null): string {
  return value === null ? '' : escapeSpreadsheetText(value);
}

function actionRequired(row: ReportRow): string {
  if (row.errors.length > 0) {
    return 'Correct this row in the spreadsheet (or fix the master data) and import it again.';
  }
  return 'Review the warning. The row can be imported as it is.';
}

/**
 * The downloadable error report: one row per spreadsheet row with errors or warnings — original row
 * number, registration number, name, status, codes, plain-language messages and the action
 * required. Every text value is formula-escaped; no internal details are included.
 */
export async function buildErrorReport(
  rows: readonly ReportRow[],
  summary: ReportSummary,
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Docversity';
  workbook.created = summary.generatedAt;

  const issues = workbook.addWorksheet('Issues', { views: [{ state: 'frozen', ySplit: 1 }] });
  issues.columns = [
    { header: 'Row', key: 'row', width: 8 },
    { header: 'Registration Number', key: 'registrationNumber', width: 24 },
    { header: 'Student Name', key: 'fullName', width: 28 },
    { header: 'Status', key: 'status', width: 11 },
    { header: 'Error Codes', key: 'codes', width: 34 },
    { header: 'Messages', key: 'messages', width: 90 },
    { header: 'Action Required', key: 'actionRequired', width: 50 },
  ];
  issues.getRow(1).font = { bold: true };
  for (const row of rows) {
    const all = [...row.errors, ...row.warnings];
    const added = issues.addRow({
      row: row.rowNumber,
      registrationNumber: text(row.registrationNumber),
      fullName: text(row.fullName),
      status: row.errors.length > 0 ? 'ERROR' : 'WARNING',
      codes: all.map((issue) => issue.code).join(', '),
      messages: text(
        all
          .map((issue) => {
            const def = issue.field ? studentImportField(issue.field as StudentImportField) : null;
            const labelStr = def ? def.label : issue.field;
            const label = labelStr ? `${labelStr}: ` : '';
            const message = issue.message.startsWith(label)
              ? issue.message
              : `${label}${issue.message}`;
            return `${issue.severity === 'error' ? 'Error' : 'Warning'} — ${message}`;
          })
          .join('\n'),
      ),
      actionRequired: actionRequired(row),
    });
    added.alignment = { wrapText: true, vertical: 'top' };
    added.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: row.errors.length > 0 ? RED : AMBER },
    };
  }

  const info = workbook.addWorksheet('Summary');
  info.columns = [
    { header: 'Item', key: 'item', width: 28 },
    { header: 'Value', key: 'value', width: 50 },
  ];
  info.getRow(1).font = { bold: true };
  info.addRow({ item: 'File', value: text(summary.filename) });
  info.addRow({ item: 'Worksheet', value: text(summary.worksheet) });
  info.addRow({
    item: 'Generated (UTC)',
    value: summary.generatedAt.toISOString().replace('T', ' ').slice(0, 19),
  });
  for (const [item, value] of Object.entries(summary.counts)) info.addRow({ item, value });

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
