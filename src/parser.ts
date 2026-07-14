import * as cheerio from 'cheerio';
import { SiteConfig, DocumentRecord } from './types';

/**
 * Extrae el ViewState del HTML inicial.
 */
export function extractViewState(html: string): string {
  const $ = cheerio.load(html);
  const value = $('input[name="javax.faces.ViewState"]').val();
  if (!value) {
    throw new Error('No se encontró javax.faces.ViewState en la página inicial.');
  }
  return value as string;
}

/**
 * Extrae el ViewState de una respuesta partial-response XML de PrimeFaces.
 */
export function extractViewStateFromPartial(xml: string): string {
  const $ = cheerio.load(xml, { xmlMode: true });
  const value = $('update#j_id1\\:javax\\.faces\\.ViewState\\:0').text();
  if (!value) {
    throw new Error('No se encontró javax.faces.ViewState en la respuesta parcial.');
  }
  return value;
}

/**
 * Extrae el HTML de resultados de una respuesta partial-response.
 */
export function extractResultsHtml(xml: string, config: SiteConfig): string {
  const $ = cheerio.load(xml, { xmlMode: true });
  // El servidor puede actualizar el contenedor pgLista o directamente el dt.
  let html = $(`update#${cssEscape(config.resultsUpdateId)}`).text();
  if (!html) {
    html = $(`update#${cssEscape(config.dataTableId)}`).text();
  }
  return html;
}

/**
 * Convierte una fila de la tabla en un DocumentRecord.
 */
export function parseRow(rowHtml: string, config: SiteConfig): DocumentRecord {
  const $ = cheerio.load(`<table>${rowHtml}</table>`);
  const cells = $('td')
    .map((_, el) => $(el).text().trim())
    .get();

  // Para OEFA: [Nro, Expediente, Administrado, Unidad, Sector, Resolución, PDF]
  const record: DocumentRecord = {
    nro: cells[0] ?? '',
    numeroExpediente: cells[1] ?? '',
    administrado: cells[2] ?? '',
    unidadFiscalizable: cells[3] ?? '',
    sector: cells[4] ?? '',
    numeroResolucion: cells[5] ?? '',
    status: 'metadata_extracted',
  };

  const link = $(config.pdfLinkSelector).attr('onclick');
  if (link) {
    const match = link.match(config.uuidRegex);
    if (match) {
      record.uuid = match[1];
      record.status = 'uuid_extracted';
    }
  }

  return record;
}

/**
 * Extrae todos los registros visibles en el HTML de resultados.
 */
export function parseResultsHtml(html: string, config: SiteConfig): DocumentRecord[] {
  const $ = cheerio.load(html);
  const rows: DocumentRecord[] = [];
  $('tbody tr').each((_, el) => {
    const rowHtml = $.html(el);
    const record = parseRow(rowHtml, config);
    if (record.numeroResolucion) {
      rows.push(record);
    }
  });
  return rows;
}

/**
 * Extrae el texto del paginador para conocer el total de páginas/registros.
 */
export function extractPaginatorText(html: string): string {
  const $ = cheerio.load(html);
  return $('.ui-paginator-current').first().text().trim();
}

/**
 * Parsea los parámetros JSF del onclick de un enlace PDF.
 */
export function parseJsfParams(onclick: string, config: SiteConfig): Record<string, string> {
  const params: Record<string, string> = {};
  const match = onclick.match(/\{([^}]+)\}/);
  if (!match) return params;

  let m;
  while ((m = config.jsfParamsRegex.exec(match[1])) !== null) {
    params[m[1]] = m[2];
  }
  return params;
}

/**
 * Escapa un id para usarlo como selector CSS.
 */
function cssEscape(id: string): string {
  return id.replace(/([:!\.])/g, '\\$1');
}
