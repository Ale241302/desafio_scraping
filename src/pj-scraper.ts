import { URLSearchParams } from 'url';
import * as cheerio from 'cheerio';
import { HttpClient, createHttpClient, responseToString, responseToBuffer } from './http-client';
import { SiteConfig, DocumentRecord } from './types';
import { Logger } from './logger';
import * as retry from './retry';
import * as storage from './storage';

/**
 * Scraper específico para jurisprudencia.pj.gob.pe (RichFaces 4 + Mojarra).
 *
 * Flujo descubierto tras inspección con VPN:
 *  1. GET  inicio.xhtml  → ViewState + parámetros dinámicos del botón "Buscar".
 *  2. POST inicio.xhtml  → txtBusqueda + parámetros del botón → 302 a resultado.xhtml.
 *  3. GET  resultado.xhtml con la misma sesión → panel con resultados.
 *  4. POST resultado.xhtml AJAX (DataScroller) para paginar.
 *  5. GET  /jurisprudenciaweb/ServletDescarga?uuid=... para descargar PDF.
 */
export class PjScraper {
  private client: HttpClient;
  private viewState: string = '';
  private searchParams: Record<string, string> = {};
  private textoBusqueda: string = '';
  private lastResultHtml: string = '';

  constructor(
    private config: SiteConfig,
    private logger: Logger,
    private dataDir: string,
    private pdfDir: string
  ) {
    this.client = createHttpClient(config);
  }

  /**
   * Carga inicio.xhtml y extrae ViewState + parámetros del botón de búsqueda general.
   */
  async init(): Promise<void> {
    this.logger.info(`Inicializando scraper PJ: ${this.config.name}`);
    try {
      const resp = await this.client.get(this.config.path);
      const html = responseToString(resp.data);
      this.viewState = this.extractViewState(html);
      this.searchParams = this.extractGeneralSearchParams(html);
      this.logger.info('ViewState y parámetros de búsqueda obtenidos.');
    } catch (err: any) {
      if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED' || err.message?.includes('timeout')) {
        throw new Error(
          'No se pudo conectar con jurisprudencia.pj.gob.pe. ' +
          'Asegúrate de tener activa la VPN de Perú y de que el sitio sea accesible desde tu ubicación.'
        );
      }
      if (err.response?.status === 403) {
        throw new Error(
          'El sitio respondió 403 Forbidden. Es posible que el acceso esté bloqueado desde tu ubicación actual. ' +
          'Activa la VPN de Perú e intenta nuevamente.'
        );
      }
      throw err;
    }
  }

  /**
   * Realiza una búsqueda por texto y devuelve el HTML completo de resultado.xhtml.
   */
  async search(texto: string): Promise<string> {
    if (!texto || !texto.trim()) {
      throw new Error('El texto de búsqueda es obligatorio para el sitio del Poder Judicial.');
    }
    this.textoBusqueda = texto;
    const postData = new URLSearchParams();
    postData.append(this.config.formId, this.config.formId);
    postData.append('javax.faces.ViewState', this.viewState);
    postData.append(this.config.filterFields.texto, texto);

    // Parámetros dinámicos del botón general de inicio.xhtml
    for (const [key, value] of Object.entries(this.searchParams)) {
      postData.append(key, value);
    }

    this.logger.info(`Buscando texto: "${texto}"`);

    // Deshabilitamos redirects para evitar que axios pierda cookies al saltar a
    // http:// en la Location del 302. Capturamos el header Location y forzamos https.
    const postResp = await this.client.post(this.config.path, postData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': this.config.baseUrl,
        'Referer': `${this.config.baseUrl}${this.config.path}`,
      },
      maxRedirects: 0,
      validateStatus: (status) => status === 302 || status === 200,
    });

    let resultUrl: string;
    const location = postResp.headers?.location as string | undefined;
    if (location) {
      resultUrl = location.replace(/^http:\/\//, 'https://');
    } else {
      const resultPath = this.config.resultPath ?? '/jurisprudenciaweb/faces/page/resultado.xhtml';
      resultUrl = `https://${new URL(this.config.baseUrl).host}${resultPath}`;
    }

    this.logger.info(`Redirect capturado a: ${resultUrl}`);

    const resp = await this.client.get(resultUrl, {
      headers: {
        'Referer': `${this.config.baseUrl}${this.config.path}`,
      },
    });

    const html = responseToString(resp.data);
    this.viewState = this.extractViewState(html);
    this.lastResultHtml = html;
    return html;
  }

  /**
   * Obtiene metadatos paginando por todas las páginas disponibles.
   * Si `includeFicha` es true, también consulta el popup "Ver ficha" de cada
   * documento para extraer datos adicionales (magistrado ponente, etc.).
   */
  async fetchMetadata(texto: string = '', maxPages: number = 0, includeFicha: boolean = true): Promise<DocumentRecord[]> {
    let html = await this.search(texto || '');
    const totalText = this.extractResultSummary(html);
    this.logger.info(`Resumen: ${totalText}`);

    const allRecords: DocumentRecord[] = [];
    let page = 1;
    let nroOffset = 0;

    while (true) {
      const records = this.parseResultsHtml(html, nroOffset);
      nroOffset += records.length;
      this.logger.info(`Página ${page}: ${records.length} registros.`);

      if (includeFicha) {
        for (let i = 0; i < records.length; i++) {
          const record = records[i];
          try {
            await this.fetchFicha(record);
            this.logger.debug(`Ficha obtenida para ${record.numeroResolucion}`);
          } catch (err: any) {
            this.logger.warn(`No se pudo obtener ficha para ${record.numeroResolucion}: ${err.message}`);
          }
          if (i < records.length - 1) {
            await retry.politeDelay(this.config.requestDelayMs / 2, this.config.randomDelayMs / 2);
          }
        }
      }

      allRecords.push(...records);

      if (maxPages > 0 && page >= maxPages) break;

      const nextPage = page + 1;
      const nextXml = await this.fetchPageAjax(nextPage);
      const panelHtml = this.extractPanelFromPartial(nextXml);
      if (!panelHtml || this.countResultPanels(panelHtml) === 0) {
        this.logger.info('No hay más páginas.');
        break;
      }

      html = `<html><body><div id="formBuscador:panel">${panelHtml}</div></body></html>`;
      page++;
      await retry.politeDelay(this.config.requestDelayMs, this.config.randomDelayMs);
    }

    this.logger.info(`Total de metadatos obtenidos: ${allRecords.length}`);
    return allRecords;
  }

  /**
   * Consulta el popup "Ver ficha" de un documento y completa los campos
   * adicionales del registro.
   */
  async fetchFicha(record: DocumentRecord): Promise<DocumentRecord> {
    if (!record.uuid) {
      throw new Error('El registro no tiene uuid, no se puede consultar la ficha.');
    }

    let source = record.fichaSource;
    let params = record.fichaParams;

    if (!source) {
      // Fallback: buscar en el HTML de resultados previo.
      if (!this.lastResultHtml) {
        this.logger.debug('No hay HTML de resultados previo; re-buscando para obtener enlace Ver ficha.');
        this.lastResultHtml = await this.search(this.textoBusqueda || record.numeroResolucion);
      }
      const found = this.extractFichaLinkParams(this.lastResultHtml, record.uuid);
      source = found.source;
      params = found.params;
    }

    if (!source) {
      throw new Error(`No se encontró el enlace "Ver ficha" para uuid=${record.uuid}.`);
    }

    const ajaxParams = new URLSearchParams();
    ajaxParams.append('javax.faces.partial.ajax', 'true');
    ajaxParams.append('javax.faces.source', source);
    ajaxParams.append('javax.faces.partial.execute', source);
    ajaxParams.append('javax.faces.partial.render', 'formBuscador:popupResolucion');
    // RichFaces requiere el id del componente fuente como parámetro de formulario
    // para identificar el componente accionado en el árbol JSF.
    ajaxParams.append(source, source);
    for (const [key, value] of Object.entries(params ?? {})) {
      ajaxParams.append(key, value);
    }
    ajaxParams.append(this.config.formId, this.config.formId);
    ajaxParams.append('javax.faces.ViewState', this.viewState);

    const resultPath = this.config.resultPath ?? '/jurisprudenciaweb/faces/page/resultado.xhtml';
    const resp = await this.client.post(resultPath, ajaxParams, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Faces-Request': 'partial/ajax',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': this.config.baseUrl,
        'Referer': `${this.config.baseUrl}${resultPath}`,
      },
    });

    const xml = responseToString(resp.data);
    const vs = this.extractViewStateFromPartial(xml);
    if (vs) this.viewState = vs;

    let fichaHtml = this.extractPopupFromPartial(xml);
    this.logger.debug(`Popup HTML length: ${fichaHtml.length}`);

    // A veces el servidor responde con el popup vacío en la primera petición;
    // reintentamos una vez si detectamos que no hay contenido útil.
    if (!this.popupHasContent(fichaHtml)) {
      this.logger.debug('Popup vacío, reintentando ficha una vez.');
      await retry.politeDelay(this.config.requestDelayMs / 2, this.config.randomDelayMs / 2);
      const retryResp = await this.client.post(resultPath, ajaxParams, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Faces-Request': 'partial/ajax',
          'X-Requested-With': 'XMLHttpRequest',
          'Origin': this.config.baseUrl,
          'Referer': `${this.config.baseUrl}${resultPath}`,
        },
      });
      const retryXml = responseToString(retryResp.data);
      const retryVs = this.extractViewStateFromPartial(retryXml);
      if (retryVs) this.viewState = retryVs;
      fichaHtml = this.extractPopupFromPartial(retryXml);
    }

    const fichaData = this.parseFichaHtml(fichaHtml);

    record.magistradoPonente = fichaData.magistradoPonente;
    record.magistradosTribunal = fichaData.magistradosTribunal;
    record.sentidoFallo = fichaData.sentidoFallo;
    record.jurisprudenciaNacional = fichaData.jurisprudenciaNacional;
    record.distritoJudicial = fichaData.distritoJudicial;
    record.normaDerechoInterno = fichaData.normaDerechoInterno;

    return record;
  }

  /**
   * Descarga un PDF a partir del uuid de un registro.
   */
  async downloadDocument(record: DocumentRecord): Promise<DocumentRecord> {
    if (!record.uuid) {
      throw new Error('El registro no tiene uuid para descargar.');
    }

    const url = `/jurisprudenciaweb/ServletDescarga?uuid=${record.uuid}`;
    this.logger.info(`Descargando PDF uuid=${record.uuid}`);

    const resp = await this.client.get(url, {
      headers: {
        'Referer': `${this.config.baseUrl}${this.config.resultPath ?? '/jurisprudenciaweb/faces/page/resultado.xhtml'}`,
      },
      responseType: 'arraybuffer',
    });

    const buffer = responseToBuffer(resp.data);
    const contentType = resp.headers?.['content-type'] as string | undefined;

    if (!this.isPdf(buffer)) {
      // Guardamos el archivo como .bin para diagnóstico sin marcarlo como PDF.
      const baseName = storage.buildPdfFilename(record).replace(/\.pdf$/, '');
      const binFilename = `${baseName}.bin`;
      storage.savePdf(buffer, this.pdfDir, binFilename);
      const preview = buffer.toString('utf-8').slice(0, 300);
      throw new Error(
        `La descarga no devolvió un PDF (content-type: ${contentType || 'desconocido'}). ` +
        `Se guardó ${binFilename} para diagnóstico. Inicio: ${preview}`
      );
    }

    const filename = storage.buildPdfFilename(record);
    storage.savePdf(buffer, this.pdfDir, filename);
    record.pdfFilename = filename;
    record.status = 'downloaded';
    return record;
  }

  /**
   * Descarga todos los PDFs pendientes.
   */
  async downloadAllPdfs(records: DocumentRecord[], maxDownloads: number = 0, retryFailed: boolean = false): Promise<void> {
    let toProcess = records.filter(
      (r) => r.status !== 'downloaded' && (!retryFailed ? r.status !== 'failed' : true)
    );
    if (maxDownloads > 0) {
      toProcess = toProcess.slice(0, maxDownloads);
    }

    this.logger.info(`Documentos a descargar: ${toProcess.length}`);
    let processed = 0;
    let downloaded = 0;
    let failed = 0;

    for (const record of toProcess) {
      processed++;
      record.lastAttempt = new Date().toISOString();
      try {
        await this.downloadDocument(record);
        downloaded++;
      } catch (err: any) {
        failed++;
        record.status = 'failed';
        record.error = err.message;
        this.logger.error(`Error descargando ${record.numeroResolucion}: ${err.message}`);
      }
      if (processed < toProcess.length) {
        await retry.politeDelay(this.config.requestDelayMs, this.config.randomDelayMs);
      }
    }

    this.logger.info(`Procesados: ${processed}, descargados: ${downloaded}, fallados: ${failed}`);
  }

  // --------------------------------------------------------------------------
  // Helpers de parseo
  // --------------------------------------------------------------------------

  private extractViewState(html: string): string {
    const $ = cheerio.load(html);
    const value = $('input[name="javax.faces.ViewState"]').val();
    if (!value) {
      throw new Error('No se encontró javax.faces.ViewState.');
    }
    return value as string;
  }

  /**
   * Extrae los parámetros del botón de búsqueda general en inicio.xhtml.
   * Ejemplo de onclick:
   * mojarra.jsfcljs(document.getElementById('formBuscador'),{
   *   'formBuscador:j_idt31':'formBuscador:j_idt31',
   *   'forward':'buscar',
   *   'busqueda':'especializada',
   *   'formBuscador:j_idt34':'21',
   *   'formBuscador:j_idt35':'DESC',
   *   'formBuscador:j_idt36':'Principal',
   *   'formBuscador:j_idt37':'1'
   * },'');
   */
  private extractGeneralSearchParams(html: string): Record<string, string> {
    const $ = cheerio.load(html);
    const onclick = $('input[type="image"][src*="btn-buscar"]').first().attr('onclick');
    if (!onclick) {
      throw new Error('No se encontró el botón de búsqueda general en inicio.xhtml.');
    }

    const params: Record<string, string> = {};
    const match = onclick.match(/\{([^}]+)\}/);
    if (!match) {
      throw new Error('No se pudieron parsear los parámetros del botón de búsqueda.');
    }

    // El onclick usa comillas escapadas: \'clave\':\'valor\'
    const normalized = match[1].replace(/\\'/g, '"').replace(/'/g, '"');
    const regex = /"([^"]+)"\s*:\s*"([^"]*)"/g;
    let m;
    while ((m = regex.exec(normalized)) !== null) {
      params[m[1]] = m[2];
    }
    return params;
  }

  private extractResultSummary(html: string): string {
    const $ = cheerio.load(html);
    return $('#formBuscador\\:optResultado').first().text().trim();
  }

  private countResultPanels(html: string): number {
    const $ = cheerio.load(html);
    return $('div[id^="formBuscador:repeat:"]').length;
  }

  /**
   * Envuelve una respuesta parcial de panel en un documento HTML completo para
   * que parseResultsHtml pueda procesarlo con cheerio.
   */
  private wrapPanelHtml(partialXml: string): string {
    const $ = cheerio.load(partialXml, { xmlMode: true });
    const panel = $('update#formBuscador\\:panel').text();
    return `<html><body><div id="formBuscador:panel">${panel}</div></body></html>`;
  }

  /**
   * Solicita la página N vía AJAX del DataScroller.
   */
  private async fetchPageAjax(page: number): Promise<string> {
    const params = new URLSearchParams();
    params.append('javax.faces.partial.ajax', 'true');
    params.append('javax.faces.source', 'formBuscador:data1');
    params.append('javax.faces.partial.execute', 'formBuscador:data1');
    params.append('javax.faces.partial.render', 'formBuscador:panel formBuscador:data1');
    params.append('formBuscador:data1:page', String(page));
    params.append(this.config.formId, this.config.formId);
    params.append('javax.faces.ViewState', this.viewState);

    const resultPath = this.config.resultPath ?? '/jurisprudenciaweb/faces/page/resultado.xhtml';
    const resp = await this.client.post(resultPath, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Faces-Request': 'partial/ajax',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': this.config.baseUrl,
        'Referer': `${this.config.baseUrl}${resultPath}`,
      },
    });

    const xml = responseToString(resp.data);
    // Actualizar ViewState si viene en la respuesta
    const vs = this.extractViewStateFromPartial(xml);
    if (vs) this.viewState = vs;
    return xml;
  }

  private extractViewStateFromPartial(xml: string): string | null {
    const $ = cheerio.load(xml, { xmlMode: true });
    return $('update#javax\\.faces\\.ViewState').first().text() || null;
  }

  /**
   * Extrae el HTML del panel desde una respuesta parcial XML.
   */
  private extractPanelFromPartial(xml: string): string {
    const $ = cheerio.load(xml, { xmlMode: true });
    return $('update#formBuscador\\:panel').first().text();
  }

  /**
   * Parsea el panel de resultados en DocumentRecords.
   */
  parseResultsHtml(html: string, nroOffset: number = 0): DocumentRecord[] {
    const $ = cheerio.load(html);
    const records: DocumentRecord[] = [];

    $('#formBuscador\\:panel > div.rf-p, #formBuscador\\:panel > div[id^="formBuscador:repeat:"]').each((_, panel) => {
      const headerSpans = $(panel).find('div.rf-p-hdr span').toArray();
      const recurso = headerSpans[0] ? $(headerSpans[0]).text().trim() : '';
      const expediente = headerSpans[1] ? $(headerSpans[1]).text().trim() : '';

      const getLabel = (label: string): string => {
        const div = $(panel).find('div.txtbold').filter((_, el) => $(el).text().trim() === label).first().parent() as any;
        return div.find('div').not('.txtbold').first().text().trim();
      };

      const tipoResolucion = getLabel('Tipo Resolución:');
      const fechaResolucion = getLabel('Fecha Resolución:');
      const organoJurisdiccional = getLabel('Órgano Jurisdiccional:');
      const pretensionDelito = getLabel('Pretención / Delito:');
      const sumilla = getLabel('Sumilla:');
      const palabrasClave = getLabel('Palabras Clave:');

      const pdfLink = $(panel).find('a[href*="ServletDescarga?uuid="]').attr('href');
      const uuidMatch = pdfLink ? pdfLink.match(/uuid=([0-9a-f-]{36})/) : null;
      const uuid = uuidMatch ? uuidMatch[1] : undefined;

      const fichaLink = $(panel).find('a[title="Ver"]').attr('onclick') || '';
      const fichaInfo = this.parseFichaOnclick(fichaLink);

      records.push({
        nro: String(nroOffset + records.length + 1),
        numeroExpediente: expediente,
        numeroResolucion: expediente, // usamos expediente como identificador único
        administrado: '',
        unidadFiscalizable: '',
        sector: '',
        recurso,
        tipoResolucion,
        fechaResolucion,
        organoJurisdiccional,
        pretensionDelito,
        sumilla,
        palabrasClave,
        uuid,
        fichaSource: fichaInfo.source,
        fichaParams: fichaInfo.params,
        status: uuid ? 'uuid_extracted' : 'metadata_extracted',
      });
    });

    return records;
  }

  /**
   * Parsea el onclick del enlace "Ver ficha".
   */
  parseFichaOnclick(onclick: string): { source: string; params: Record<string, string> } {
    const result = { source: '', params: {} as Record<string, string> };
    if (!onclick) return result;

    const normalized = decodeJsString(onclick);
    const sourceMatch = normalized.match(/RichFaces\.ajax\("([^"]+)"/);
    if (sourceMatch) result.source = sourceMatch[1];

    const paramsMatch = normalized.match(/"parameters":\{([^}]+)\}/);
    if (paramsMatch) {
      const regex = /"([^"]+)"\s*:\s*"([^"]*)"/g;
      let m;
      while ((m = regex.exec(paramsMatch[1])) !== null) {
        result.params[m[1]] = m[2];
      }
    }
    return result;
  }

  /**
   * Extrae el source y parámetros del enlace "Ver ficha" para un uuid dado.
   */
  extractFichaLinkParams(html: string, uuid: string): { source: string; params: Record<string, string> } {
    const $ = cheerio.load(html);
    let source = '';
    const params: Record<string, string> = {};

    $('a[title="Ver"]').each((_, el) => {
      const onclick = $(el).attr('onclick') || '';
      if (!onclick.includes(uuid)) return;

      const info = this.parseFichaOnclick(onclick);
      source = info.source;
      Object.assign(params, info.params);
      return false; // detener iteración
    });

    return { source, params };
  }

  /**
   * Extrae el HTML del popup desde una respuesta parcial XML.
   */
  private extractPopupFromPartial(xml: string): string {
    const $ = cheerio.load(xml, { xmlMode: true });
    return $('update#formBuscador\\:popupResolucion').first().text();
  }

  /**
   * Determina si el popup contiene datos útiles (más allá del esqueleto vacío).
   */
  private popupHasContent(html: string): boolean {
    return html.includes('class="panel panel-gris"') || html.includes('DATOS DE LA RESOLUCIÓN');
  }

  /**
   * Parsea el HTML del popup "Ver ficha" en un objeto con los campos detallados.
   *
   * El popup usa una rejilla Bootstrap con pares etiqueta/valor.
   * Las etiquetas relevantes pueden variar ligeramente según el tipo de resolución,
   * por lo que se buscan variaciones conocidas.
   */
  parseFichaHtml(html: string): Record<string, string> {
    const $ = cheerio.load(html);
    const result: Record<string, string> = {};

    const getValue = (labels: string[]): string => {
      for (const label of labels) {
        // 1) Formato real del popup (Bootstrap grid con span.data)
        const gridLabel = $('.txtbold, .col-sm-6.txtbold').filter((_, el) => $(el).text().trim() === label).first();
        const gridValue = gridLabel.next('.col-sm-6, .marginb2').find('span.data').first().text().trim();
        if (gridValue) return gridValue;

        // 2) Formato de tabla (usado en tests y posibles variantes antiguas)
        const td = $('td').filter((_, el) => $(el).text().trim() === label).first();
        const tableValue = td.next().text().trim();
        if (tableValue) return tableValue;
      }
      return '';
    };

    result.magistradoPonente = getValue(['*** Ponente:', 'Ponente:', 'Magistrado Ponente:']);
    result.magistradosTribunal = getValue(['Jueces Supremos:', 'Magistrados del Tribunal:', 'Magistrados:']);
    result.sentidoFallo = getValue(['Fallo/Sentido de la Resolución:', 'Sentido del Fallo:', 'Sentido de la Resolución:']);
    result.jurisprudenciaNacional = getValue(['Jurisprudencia Nacional/Acuerdo Plenario:', 'Jurisprudencia Nacional:']);
    result.distritoJudicial = getValue(['Distrito Judicial de Procedencia:', 'Distrito Judicial:']);
    result.normaDerechoInterno = getValue(['Norma de Derecho Interno:']);

    return result;
  }

  private isPdf(buffer: Buffer): boolean {
    if (buffer.length < 8) return false;
    const hasHeader = buffer.toString('ascii', 0, 4) === '%PDF';
    // Buscamos el marcador de fin dentro de los últimos 1024 bytes (PDFs
    // lineales terminan con %%EOF; algunos tienen comentarios posteriores).
    const tail = buffer.slice(-1024).toString('ascii');
    const hasFooter = tail.includes('%%EOF');
    return hasHeader && hasFooter;
  }
}

/**
 * Decodifica un string con escapes JS tal como los genera RichFaces/Mojarra
 * en los atributos onclick (p. ej. \"uuid\", \\u002D, \\/).
 */
export function decodeJsString(value: string): string {
  // Primero convertimos las comillas y barras escapadas, luego decodificamos
  // secuencias \uXXXX reales mediante JSON.parse.
  const normalized = value
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/')
    .replace(/\\\\/g, '\\');
  try {
    return JSON.parse('"' + normalized.replace(/"/g, '\\"') + '"');
  } catch {
    return normalized;
  }
}
