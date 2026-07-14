import { SiteConfig } from './types';

/**
 * Configuraciones soportadas.
 *
 * El sitio principal requiere VPN a Perú y no ha sido probado desde este entorno,
 * pero se incluye con los parámetros típicos de una aplicación JSF/PrimeFaces
 * del Poder Judicial del Perú. El sitio alternativo (OEFA) sí fue probado y
 * funciona como demostración del scraper.
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
 * Configuración tentativa para el sitio principal del Poder Judicial.
 * Los ids reales deberían ajustarse tras inspeccionar el sitio con VPN.
 */
export const pjConfig: SiteConfig = {
  name: 'Poder Judicial del Perú - Jurisprudencia',
  baseUrl: 'https://jurisprudencia.pj.gob.pe',
  path: '/jurisprudenciaweb/faces/page/resultado.xhtml',
  referer: 'https://jurisprudencia.pj.gob.pe/jurisprudenciaweb/faces/page/resultado.xhtml',

  formId: 'formBusqueda',
  searchButtonId: 'formBusqueda:btnBuscar',
  dataTableId: 'formBusqueda:dtResultados',
  resultsUpdateId: 'formBusqueda:pnlResultados',
  excelExportButtonId: 'formBusqueda:dtResultados:btnExportarExcel',

  filterFields: {
    numeroExpediente: 'formBusqueda:txtNroExpediente',
    numeroResolucion: 'formBusqueda:txtNroResolucion',
  },
  uniqueSearchField: 'numeroResolucion',

  pdfLinkSelector: 'a[onclick*="param_uuid"]',
  uuidRegex: /param_uuid':'([^']+)'/,
  jsfParamsRegex: /'([^']+)'\s*:\s*'([^']*)'/g,

  columns: ['Nro.', 'Expediente', 'Resolución', 'Órgano', 'Fecha', 'Sumilla'],
  excelFilename: 'RESULTADOS.xls',

  requestDelayMs: 1000,
  randomDelayMs: 500,
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
