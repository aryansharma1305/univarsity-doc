import { isSensitiveImportHeader } from '@docversity/validation';
import { verifyXlsxContainer, type ContainerLimits } from './container.js';
import { ImportFileError } from './errors.js';
import { loadWorkbook } from './workbook.js';

/** Reject before object storage: hiding an ID from mapping does not remove it from the source ZIP. */
export async function rejectPopulatedIdentityColumns(
  bytes: Uint8Array,
  limits: ContainerLimits,
): Promise<void> {
  verifyXlsxContainer(bytes, limits);
  const workbook = await loadWorkbook(bytes);
  for (const sheet of workbook.worksheets) {
    sheet.getRow(1).eachCell((header, column) => {
      if (!isSensitiveImportHeader(header.text)) return;
      sheet.getColumn(column).eachCell({ includeEmpty: true }, (cell, row) => {
        const hasValue =
          row > 1 &&
          cell.value !== null &&
          (typeof cell.value !== 'string' || cell.value.trim() !== '');
        if (hasValue || Object.hasOwn(cell.model, 'comment')) {
          throw new ImportFileError(
            'IDENTITY_DATA_IN_SOURCE',
            'Remove national identity numbers from an upload copy before importing. Keep the original workbook offline; identity values cannot be stored in Docversity.',
          );
        }
      });
    });
  }
}
