/**
 * Tipos compartidos del scraper.
 */

export interface SiteConfig {
  /** Nombre legible del sitio. */
  name: string;
  /** Host base, p. ej. https://publico.oefa.gob.pe */
  baseUrl: string;
  /** Path de la página a scrapear, p. ej. /repdig/consulta/consultaTfa.xhtml */
  path: string;
  /** Referer usado en los POST. */
  referer: string;

  /** Id del formulario JSF. */
  formId: string;
  /** Id del botón de búsqueda. */
  searchButtonId: string;
  /** Id del DataTable que contiene los resultados. */
  dataTableId: string;
  /** Id del contenedor que se actualiza en la búsqueda (puede ser el mismo dt o un wrapper). */
  resultsUpdateId: string;
  /** Id del botón exportador a Excel, si existe. */
  excelExportButtonId?: string;

  /** Mapeo de campos de filtro del formulario. */
  filterFields: Record<string, string>;
  /** Opciones del filtro de sector (si aplica). */
  sectorOptions?: { value: string; label: string }[];
  /** Campo por el cual buscar un documento individual (debe ser único). */
  uniqueSearchField: string;

  /** Selector CSS para extraer el enlace/UUID del PDF de cada fila. */
  pdfLinkSelector: string;
  /** Expresión regular para extraer el UUID del enlace. */
  uuidRegex: RegExp;
  /** Expresión regular para extraer los parámetros JSF del onclick del enlace PDF. */
  jsfParamsRegex: RegExp;

  /** Columnas de la tabla de resultados. */
  columns: string[];
  /** Nombre del archivo Excel descargado, si aplica. */
  excelFilename?: string;

  /** Número máximo de documentos a procesar por ejecución (0 = todos). */
  maxDocuments?: number;
  /** Delay base entre requests en ms. */
  requestDelayMs: number;
  /** Delay extra aleatorio máximo en ms. */
  randomDelayMs: number;
}

export interface DocumentRecord {
  /** Número de fila en el origen. */
  nro: string;
  /** Número de expediente. */
  numeroExpediente: string;
  /** Administrado. */
  administrado: string;
  /** Unidad fiscalizable. */
  unidadFiscalizable: string;
  /** Sector. */
  sector: string;
  /** Número de resolución / identificador único. */
  numeroResolucion: string;
  /** UUID del PDF (si se obtuvo). */
  uuid?: string;
  /** Nombre del archivo PDF descargado. */
  pdfFilename?: string;
  /** Estado del procesamiento. */
  status: 'pending' | 'metadata_extracted' | 'uuid_extracted' | 'downloaded' | 'failed';
  /** Mensaje de error si falló. */
  error?: string;
  /** Timestamp del último intento. */
  lastAttempt?: string;
}

export interface ScraperProgress {
  total: number;
  processed: number;
  downloaded: number;
  failed: number;
  pending: number;
}
