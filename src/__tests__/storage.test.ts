import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { saveCsv } from '../storage';
import { DocumentRecord } from '../types';

describe('saveCsv', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scraper-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('guarda registros en CSV con headers correctos', () => {
    const filePath = path.join(tempDir, 'metadata.csv');
    const records: DocumentRecord[] = [
      {
        nro: '1',
        numeroExpediente: 'EXP-1',
        administrado: 'Admin',
        unidadFiscalizable: 'UF',
        sector: 'MINERIA',
        numeroResolucion: 'RES-1',
        uuid: 'uuid-1',
        status: 'downloaded',
      },
    ];

    saveCsv(records, filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('nro,numeroExpediente');
    expect(content).toContain('EXP-1');
    expect(content).toContain('uuid-1');
  });

  it('escapa comillas y saltos de línea', () => {
    const filePath = path.join(tempDir, 'metadata.csv');
    const records: DocumentRecord[] = [
      {
        nro: '1',
        numeroExpediente: 'EXP',
        administrado: 'Adm"in',
        unidadFiscalizable: 'UF\nLine2',
        sector: 'S',
        numeroResolucion: 'RES',
        status: 'metadata_extracted',
      },
    ];

    saveCsv(records, filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('Adm""in');
    expect(content).not.toContain('\nLine2');
  });
});
