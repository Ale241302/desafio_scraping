import * as XLSX from 'xlsx';
import { SiteConfig, DocumentRecord } from './types';

/**
 * Lee el Excel exportado y devuelve registros con metadatos.
 */
export function parseExcel(buffer: Buffer, config: SiteConfig): DocumentRecord[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

  const records: DocumentRecord[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    const record: DocumentRecord = {
      nro: String(row[0] ?? '').trim(),
      numeroExpediente: String(row[1] ?? '').trim(),
      administrado: String(row[2] ?? '').trim(),
      unidadFiscalizable: String(row[3] ?? '').trim(),
      sector: String(row[4] ?? '').trim(),
      numeroResolucion: String(row[5] ?? '').trim(),
      status: 'metadata_extracted',
    };

    if (record.numeroResolucion) {
      records.push(record);
    }
  }

  return records;
}
