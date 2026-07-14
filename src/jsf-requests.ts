import { URLSearchParams } from 'url';
import { HttpClient, responseToBuffer, responseToString } from './http-client';
import { SiteConfig } from './types';

function getAjaxHeaders(config: SiteConfig) {
  return {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Faces-Request': 'partial/ajax',
    'X-Requested-With': 'XMLHttpRequest',
    'Origin': config.baseUrl,
    'Referer': config.referer,
  };
}

function getFormFields(config: SiteConfig, overrides: Record<string, string> = {}): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, fieldId] of Object.entries(config.filterFields)) {
    fields[fieldId] = overrides[key] ?? '';
  }
  return fields;
}

/**
 * Realiza la búsqueda inicial (vacía o con filtros) vía AJAX.
 */
export async function searchDocuments(
  client: HttpClient,
  config: SiteConfig,
  viewState: string,
  filters: Record<string, string> = {}
): Promise<string> {
  const params = new URLSearchParams();
  params.append('javax.faces.partial.ajax', 'true');
  params.append('javax.faces.source', config.searchButtonId);
  params.append('javax.faces.partial.execute', '@all');
  params.append('javax.faces.partial.render', `${config.resultsUpdateId} ${config.filterFields.numeroExpediente ?? ''}`.trim());
  params.append(config.searchButtonId, config.searchButtonId);
  params.append(config.formId, config.formId);

  const fields = getFormFields(config, filters);
  for (const [key, value] of Object.entries(fields)) {
    params.append(key, value);
  }

  params.append(`${config.dataTableId}_scrollState`, '0,0');
  params.append('javax.faces.ViewState', viewState);

  const resp = await client.post(config.path, params, {
    headers: getAjaxHeaders(config),
  });

  return responseToString(resp.data);
}

/**
 * Solicita la descarga del Excel con todos los registros.
 */
export async function exportExcel(
  client: HttpClient,
  config: SiteConfig,
  viewState: string,
  filters: Record<string, string> = {}
): Promise<Buffer> {
  if (!config.excelExportButtonId) {
    throw new Error('Este sitio no tiene configurado un botón de exportación a Excel.');
  }

  const params = new URLSearchParams();
  params.append(config.formId, config.formId);

  const fields = getFormFields(config, filters);
  for (const [key, value] of Object.entries(fields)) {
    params.append(key, value);
  }

  params.append(`${config.dataTableId}_scrollState`, '0,0');
  params.append('javax.faces.ViewState', viewState);
  params.append(config.excelExportButtonId, config.excelExportButtonId);

  const resp = await client.post(config.path, params, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': config.baseUrl,
      'Referer': config.referer,
    },
    responseType: 'arraybuffer',
  });

  return responseToBuffer(resp.data);
}

/**
 * Descarga un PDF a partir de los parámetros JSF extraídos del enlace.
 */
export async function downloadPdf(
  client: HttpClient,
  config: SiteConfig,
  viewState: string,
  jsfParams: Record<string, string>
): Promise<Buffer> {
  const params = new URLSearchParams();
  params.append(config.formId, config.formId);

  const fields = getFormFields(config);
  for (const [key, value] of Object.entries(fields)) {
    params.append(key, value);
  }

  params.append(`${config.dataTableId}_scrollState`, '0,0');
  params.append('javax.faces.ViewState', viewState);

  for (const [key, value] of Object.entries(jsfParams)) {
    if (key) params.append(key, value);
  }

  const resp = await client.post(config.path, params, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': config.baseUrl,
      'Referer': config.referer,
    },
    responseType: 'arraybuffer',
  });

  return responseToBuffer(resp.data);
}
