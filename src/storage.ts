import * as fs from 'fs';
import * as path from 'path';
import { DocumentRecord } from './types';

/**
 * Crea los directorios necesarios para la ejecución.
 */
export function createOutputDirs(baseDir: string): { dataDir: string; pdfDir: string; logDir: string } {
  const dataDir = path.join(baseDir, 'data');
  const pdfDir = path.join(baseDir, 'pdfs');
  const logDir = path.join(baseDir, 'logs');
  for (const dir of [dataDir, pdfDir, logDir]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  return { dataDir, pdfDir, logDir };
}

/**
 * Guarda los metadatos en JSON.
 */
export function saveJson(records: DocumentRecord[], filePath: string): void {
  fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf-8');
}

/**
 * Guarda los metadatos en CSV.
 */
export function saveCsv(records: DocumentRecord[], filePath: string): void {
  const headers = [
    'nro',
    'numeroExpediente',
    'administrado',
    'unidadFiscalizable',
    'sector',
    'numeroResolucion',
    'recurso',
    'tipoResolucion',
    'fechaResolucion',
    'organoJurisdiccional',
    'pretensionDelito',
    'sumilla',
    'palabrasClave',
    'magistradoPonente',
    'magistradosTribunal',
    'sentidoFallo',
    'jurisprudenciaNacional',
    'distritoJudicial',
    'normaDerechoInterno',
    'uuid',
    'pdfFilename',
    'status',
    'error',
    'lastAttempt',
  ];

  const lines = [headers.join(',')];
  for (const r of records) {
    const row = headers.map((h) => {
      const val = (r as any)[h] ?? '';
      return `"${String(val).replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, '')}"`;
    });
    lines.push(row.join(','));
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
}

/**
 * Carga progreso previo si existe.
 */
export function loadProgress(filePath: string): DocumentRecord[] | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DocumentRecord[];
  } catch {
    return null;
  }
}

/**
 * Guarda un PDF en disco.
 */
export function savePdf(buffer: Buffer, pdfDir: string, filename: string): string {
  const filePath = path.join(pdfDir, filename);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

/**
 * Genera un nombre de archivo descriptivo para el PDF.
 */
export function buildPdfFilename(record: DocumentRecord): string {
  const safe = (s: string) =>
    s
      .replace(/[^a-zA-Z0-9\-_\. ]/g, '_')
      .replace(/_+/g, '_')
      .trim()
      .slice(0, 80);
  const res = safe(record.numeroResolucion) || 'SIN_RESOLUCION';
  const exp = safe(record.numeroExpediente) || 'SIN_EXPEDIENTE';
  return `${res}_${exp}.pdf`;
}
