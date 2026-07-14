import { SiteConfig } from './types';

/**
 * Configuraciones soportadas.
 *
 * El sitio alternativo (OEFA) funciona como demostración del scraper con
 * PrimeFaces. El sitio principal del Poder Judicial (PJ) utiliza RichFaces 4
 * y requiere un flujo ligeramente diferente: la búsqueda se inicia desde
 * inicio.xhtml y el servidor responde con un redirect 302 a resultado.xhtml.
 */

export const oefaConfig: SiteConfig = {
  name: 'OEFA - Tribunal de Fiscalización Ambiental',
  baseUrl: 'https://publico.oefa.gob.pe',
  path: '/repdig/consulta/consultaTfa.xhtml',
  referer: 'https://publico.oefa.gob.pe/repdig/consulta/consultaTfa.xhtml',

  formId: 'listarDetalleInfraccionRAAForm',
  searchButtonId: 'listarDetalleInfraccionRAAForm:btnBuscar',
  dataTableId: 'listarDetalleInfraccionRAAForm:dt',
  resultsUpdateId: 'listarDetalleInfraccionRAAForm:pgLista',
  excelExportButtonId: 'listarDetalleInfraccionRAAForm:dt:j_idt38',

  filterFields: {
    numeroExpediente: 'listarDetalleInfraccionRAAForm:txtNroexp',
    administrado: 'listarDetalleInfraccionRAAForm:j_idt21',
    unidadFiscalizable: 'listarDetalleInfraccionRAAForm:j_idt25',
    sector: 'listarDetalleInfraccionRAAForm:idsector',
    numeroResolucion: 'listarDetalleInfraccionRAAForm:j_idt34',
  },
  sectorOptions: [
    { value: '', label: 'Todos' },
    { value: '2', label: 'ELECTRICIDAD' },
    { value: '3', label: 'HIDROCARBUROS' },
    { value: '9', label: 'INDUSTRIA' },
    { value: '1', label: 'MINERIA' },
    { value: '8', label: 'PESQUERIA' },
  ],
  uniqueSearchField: 'numeroResolucion',

  pdfLinkSelector: 'a[onclick*="param_uuid"]',
  uuidRegex: /param_uuid':'([^']+)'/,
  jsfParamsRegex: /'([^']+)'\s*:\s*'([^']*)'/g,

  columns: ['Nro.', 'Número de expediente', 'Administrado', 'Unidad fiscalizable', 'Sector', 'Nro. Resolución de Apelación'],
  excelFilename: 'RESOLUCIONES_APELACION.xls',

  requestDelayMs: 800,
  randomDelayMs: 400,
};

/**
 * Configuración para el sitio principal del Poder Judicial del Perú.
 * La búsqueda general inicia en inicio.xhtml; los resultados se renderizan
 * en resultado.xhtml tras un redirect 302.
 */
export const pjConfig: SiteConfig = {
  name: 'Poder Judicial del Perú - Jurisprudencia',
  baseUrl: 'https://jurisprudencia.pj.gob.pe',
  path: '/jurisprudenciaweb/faces/page/inicio.xhtml',
  resultPath: '/jurisprudenciaweb/faces/page/resultado.xhtml',
  referer: 'https://jurisprudencia.pj.gob.pe/jurisprudenciaweb/faces/page/inicio.xhtml',

  formId: 'formBuscador',
  searchButtonId: 'formBuscador:j_idt31',
  dataTableId: 'formBuscador:panel',
  resultsUpdateId: 'formBuscador:panel',
  excelExportButtonId: 'formBuscador:j_idt413',

  filterFields: {
    texto: 'formBuscador:txtBusqueda',
  },
  uniqueSearchField: 'texto',

  pdfLinkSelector: 'a[href*="ServletDescarga?uuid="]',
  uuidRegex: /ServletDescarga\?uuid=([0-9a-f-]{36})/,
  jsfParamsRegex: /[?&]([^=]+)=([^&]+)/g,

  columns: ['Nro.', 'Recurso', 'Expediente', 'Tipo Resolución', 'Fecha', 'Órgano', 'Pretensión/Delito', 'Sumilla', 'Palabras clave'],
  excelFilename: 'Resoluciones_Jurisprudencia.xls',

  requestDelayMs: 1200,
  randomDelayMs: 600,
};

export function getSiteConfig(siteName: string): SiteConfig {
  switch (siteName.toLowerCase()) {
    case 'oefa':
      return oefaConfig;
    case 'pj':
    case 'jurisprudencia':
      return pjConfig;
    default:
      throw new Error(`Sitio no soportado: ${siteName}. Use 'oefa' o 'pj'.`);
  }
}
