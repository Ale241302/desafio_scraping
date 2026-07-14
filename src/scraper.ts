import { URLSearchParams } from 'url';
import { HttpClient, responseToString } from './http-client';
import { SiteConfig, DocumentRecord } from './types';
import * as parser from './parser';
import * as jsf from './jsf-requests';
import * as storage from './storage';
import * as excel from './excel';
import { Logger } from './logger';

export interface ScraperOptions {
  /** Si es true, solo obtiene metadatos del Excel sin descargar PDFs. */
  metadataOnly?: boolean;
  /** Número máximo de PDFs a descargar (0 = ilimitado). */
  maxDownloads?: number;
  /** Si es true, reintenta los documentos marcados como failed. */
  retryFailed?: boolean;
}

export class JsfPrimefacesScraper {
  private client: HttpClient;
  private viewState: string = '';

  constructor(
    private config: SiteConfig,
    private logger: Logger,
    private dataDir: string,
    private pdfDir: string
  ) {
    this.client = require('./http-client').createHttpClient(config);
  }

  /**
   * Inicializa el scraper obteniendo la página inicial y el ViewState.
   */
  async init(): Promise<void> {
    this.logger.info(`Inicializando scraper para: ${this.config.name}`);
    const resp = await this.client.get(this.config.path);
    this.viewState = parser.extractViewState(responseToString(resp.data));
    this.logger.info('ViewState obtenido correctamente.');
  }

  /**
   * Obtiene todos los metadatos disponibles.
   * Estrategia preferida: descargar el Excel exportado por PrimeFaces.
   * Fallback: parsear la primera página de resultados.
   */
  async fetchMetadata(): Promise<DocumentRecord[]> {
    // PrimeFaces actualiza el ViewState tras la búsqueda; necesitamos ese
    // ViewState actualizado para que la exportación a Excel funcione.
    this.logger.info('Realizando búsqueda vacía para inicializar el estado...');
    let partialXml = await jsf.searchDocuments(this.client, this.config, this.viewState);
    this.viewState = parser.extractViewStateFromPartial(partialXml);

    if (this.config.excelExportButtonId) {
      try {
        this.logger.info('Intentando descargar Excel con todos los metadatos...');
        const buffer = await jsf.exportExcel(this.client, this.config, this.viewState);
        const records = excel.parseExcel(buffer, this.config);
        this.logger.info(`Metadatos obtenidos vía Excel: ${records.length} registros.`);
        return records;
      } catch (err: any) {
        this.logger.warn(`Falló la descarga de Excel: ${err.message}. Usando fallback de tabla.`);
        this.logger.warn(err.stack ?? '');
      }
    }

    const html = parser.extractResultsHtml(partialXml, this.config);
    const records = parser.parseResultsHtml(html, this.config);
    this.logger.info(`Metadatos obtenidos vía tabla: ${records.length} registros.`);
    return records;
  }

  /**
   * Busca un documento por su identificador único (p. ej. número de resolución)
   * y extrae el UUID del PDF.
   */
  async fetchUuid(record: DocumentRecord): Promise<DocumentRecord> {
    const fieldId = this.config.filterFields[this.config.uniqueSearchField];
    if (!fieldId) {
      throw new Error(`Campo único no configurado: ${this.config.uniqueSearchField}`);
    }

    const filters: Record<string, string> = {};
    filters[this.config.uniqueSearchField] = record.numeroResolucion;

    const partialXml = await jsf.searchDocuments(this.client, this.config, this.viewState, filters);
    this.viewState = parser.extractViewStateFromPartial(partialXml);
    const html = parser.extractResultsHtml(partialXml, this.config);
    const results = parser.parseResultsHtml(html, this.config);
    this.logger.debug(`fetchUuid search returned ${results.length} rows for ${record.numeroResolucion}`);

    if (results.length === 0) {
      this.logger.debug(`Partial XML preview: ${partialXml.slice(0, 500)}`);
      throw new Error('La búsqueda no devolvió resultados.');
    }

    const match = results.find(
      (r) => r.numeroResolucion.trim() === record.numeroResolucion.trim()
    ) ?? results[0];

    if (match.uuid) {
      record.uuid = match.uuid;
      record.status = 'uuid_extracted';
    } else {
      throw new Error('No se encontró el enlace de descarga del PDF.');
    }

    return record;
  }

  /**
   * Descarga el PDF de un documento.
   */
  async downloadDocument(record: DocumentRecord): Promise<DocumentRecord> {
    if (!record.uuid) {
      throw new Error('El documento no tiene UUID.');
    }

    const filters: Record<string, string> = {};
    filters[this.config.uniqueSearchField] = record.numeroResolucion;

    const partialXml = await jsf.searchDocuments(this.client, this.config, this.viewState, filters);
    this.viewState = parser.extractViewStateFromPartial(partialXml);
    const html = parser.extractResultsHtml(partialXml, this.config);
    const results = parser.parseResultsHtml(html, this.config);

    const match = results.find(
      (r) => r.numeroResolucion.trim() === record.numeroResolucion.trim()
    ) ?? results[0];

    if (!match.uuid) {
      throw new Error('No se encontró el enlace de descarga del PDF en la búsqueda.');
    }

    record.uuid = match.uuid;

    const link = this.extractPdfLink(html, record.numeroResolucion);
    if (!link) {
      throw new Error('No se pudo extraer el enlace PDF del HTML.');
    }

    const jsfParams = parser.parseJsfParams(link, this.config);
    const buffer = await jsf.downloadPdf(this.client, this.config, this.viewState, jsfParams);

    if (!this.isPdf(buffer)) {
      const text = buffer.toString('utf-8').slice(0, 500);
      throw new Error(`La descarga no devolvió un PDF. Inicio: ${text}`);
    }

    const filename = storage.buildPdfFilename(record);
    storage.savePdf(buffer, this.pdfDir, filename);
    record.pdfFilename = filename;
    record.status = 'downloaded';

    return record;
  }

  /**
   * Extrae el onclick del enlace PDF para una resolución dada.
   */
  private extractPdfLink(html: string, numeroResolucion: string): string | undefined {
    const $ = require('cheerio').load(html);
    let link: string | undefined;
    $('tbody tr').each((_: any, el: any) => {
      const rowHtml = $.html(el);
      if (rowHtml.includes(numeroResolucion)) {
        const onclick = $(el).find(this.config.pdfLinkSelector).attr('onclick');
        if (onclick) link = onclick;
      }
    });
    return link;
  }

  private isPdf(buffer: Buffer): boolean {
    return buffer.length > 4 && buffer.toString('ascii', 0, 4) === '%PDF';
  }
}
