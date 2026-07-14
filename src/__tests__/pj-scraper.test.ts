import { describe, it, expect } from 'vitest';
import { PjScraper, decodeJsString } from '../pj-scraper';

const SAMPLE_RESULT_HTML = `
<html>
<body>
<div id="formBuscador:panel">
  <div class="rf-p" id="formBuscador:repeat:0:j_idt455">
    <div class="rf-p-hdr">
      <span style="font-weight:bold">&nbsp;&nbsp;Apelación&nbsp;&nbsp;&nbsp;</span>
      <span style="font-weight:bold">00523-2026-0-1903-JR-FP-01</span>
    </div>
    <div class="rf-p-b">
      <div class="row">
        <div class="col-sm-4 marginb">
          <div class="col-md-12 txtbold">Tipo Resolución:</div>
          <div class="col-md-12">Sentencia de Vista</div>
        </div>
        <div class="col-sm-4 marginb">
          <div class="col-md-12 txtbold">Fecha Resolución:</div>
          <div class="col-md-12">07/07/2026</div>
        </div>
        <div class="col-sm-4 marginb">
          <div class="col-md-12 txtbold">Órgano Jurisdiccional:</div>
          <div class="col-md-12">SALA CIVIL - SEDE CENTRAL</div>
        </div>
      </div>
      <div class="row">
        <div class="col-sm-8 marginb">
          <div class="col-md-12 txtbold">Pretención / Delito:</div>
          <div class="col-md-12">INFRACCION CONTRA EL PATRIMONIO</div>
        </div>
      </div>
      <div class="row">
        <div class="col-sm-12 marginb">
          <div class="col-md-12 txtbold">Sumilla:</div>
          <div class="col-md-12">EL DEBIDO PROCESO...</div>
        </div>
      </div>
      <div class="row">
        <div class="col-sm-12 marginb">
          <div class="col-md-12 txtbold">Palabras Clave:</div>
          <div class="col-md-12">INFRACTOR, MENOR INFRACTOR</div>
        </div>
      </div>
      <a href="/jurisprudenciaweb/ServletDescarga?uuid=39596387-9c0e-4565-acbd-09bd1b98842c">
        <img src="btn-ver-resolucion.png" />
      </a>
      <a href="#" title="Ver" onclick="jsf.util.chain(this,event,&quot;RichFaces.$('panelState').show();&quot;,&quot;RichFaces.ajax(\\&quot;formBuscador:repeat:0:j_idt503\\&quot;,event,{\\&quot;parameters\\&quot;:{\\&quot;uuid\\&quot;:\\&quot;39596387-9c0e-4565-acbd-09bd1b98842c\\&quot;}} )&quot;);return false;">Ver</a>
    </div>
  </div>
</div>
</body>
</html>
`;

const SAMPLE_FICHA_HTML = `
<div id="formBuscador:popupResolucion">
  <table>
    <tr><td>Magistrado Ponente:</td><td>JUAN PÉREZ GARCÍA</td></tr>
    <tr><td>Magistrados del Tribunal:</td><td>MARÍA LÓPEZ; PEDRO SOTO</td></tr>
    <tr><td>Sentido del Fallo:</td><td>FUNDADA EN PARTE</td></tr>
    <tr><td>Jurisprudencia Nacional:</td><td>CASACIÓN N° 123-2020</td></tr>
    <tr><td>Distrito Judicial de Procedencia:</td><td>LIMA</td></tr>
    <tr><td>Norma de Derecho Interno:</td><td>ART. 1° CONSTITUCIÓN</td></tr>
  </table>
</div>
`;

const SAMPLE_FICHA_GRID_HTML = `
<div class="panel panel-gris">
  <div class="panel-heading"><div class="txtbold">DATOS DE LA RESOLUCIÓN:</div></div>
  <div class="panel-body">
    <div class="row marginb">
      <div class="col-sm-6 txtbold">Fallo/Sentido de la Resolución:</div>
      <div class="col-sm-6 marginb2"><span class="data">Confirmada</span></div>
      <div class="col-sm-6 txtbold" style="clear:both;">Jueces Supremos:</div>
      <div class="col-sm-6 marginb2"><span class="data">MAGISTRADO A, MAGISTRADO B</span></div>
      <div class="col-sm-6 txtbold" style="clear:both;">*** Ponente:</div>
      <div class="col-sm-6 marginb2"><span class="data">MAGISTRADO PONENTE</span></div>
      <div class="col-sm-6 txtbold" style="clear:both;">Jurisprudencia Nacional/Acuerdo Plenario:</div>
      <div class="col-sm-6 marginb2"><span class="data">ACUERDO PLENARIO N° 1</span></div>
      <div class="col-sm-6 txtbold" style="clear:both;">Norma de Derecho Interno:</div>
      <div class="col-sm-6 marginb2"><span class="data">ART. 2°</span></div>
    </div>
  </div>
</div>
<div class="panel panel-gris">
  <div class="panel-heading"><div class="txtbold">DATOS DEL PROCESO:</div></div>
  <div class="panel-body">
    <div class="row marginb">
      <div class="col-sm-6 txtbold">Distrito Judicial de Procedencia:</div>
      <div class="col-sm-6 marginb2"><span class="data">Lima</span></div>
    </div>
  </div>
</div>
`;

describe('decodeJsString', () => {
  it('decodifica escapes de RichFaces (uuid con guiones)', () => {
    const encoded = '39596387\\\\u002D9c0e\\\\u002D4565';
    expect(decodeJsString(encoded)).toBe('39596387-9c0e-4565');
  });

  it('decodifica barras y comillas escapadas', () => {
    const encoded = 'fecha: 07\\\\/07\\\\/2026';
    expect(decodeJsString(encoded)).toBe('fecha: 07/07/2026');
  });
});

describe('PjScraper.parseResultsHtml', () => {
  it('extrae metadatos del panel de resultados', () => {
    const scraper = new PjScraper({} as any, {} as any, '.', '.');
    const records = scraper.parseResultsHtml(SAMPLE_RESULT_HTML);

    expect(records).toHaveLength(1);
    const r = records[0];
    expect(r.recurso).toBe('Apelación');
    expect(r.numeroExpediente).toBe('00523-2026-0-1903-JR-FP-01');
    expect(r.tipoResolucion).toBe('Sentencia de Vista');
    expect(r.fechaResolucion).toBe('07/07/2026');
    expect(r.uuid).toBe('39596387-9c0e-4565-acbd-09bd1b98842c');
    expect(r.status).toBe('uuid_extracted');
  });

  it('numera los registros a partir del offset', () => {
    const scraper = new PjScraper({} as any, {} as any, '.', '.');
    const records = scraper.parseResultsHtml(SAMPLE_RESULT_HTML, 10);
    expect(records[0].nro).toBe('11');
  });
});

describe('PjScraper.parseFichaHtml', () => {
  it('extrae los campos detallados del popup', () => {
    const scraper = new PjScraper({} as any, {} as any, '.', '.');
    const data = scraper.parseFichaHtml(SAMPLE_FICHA_HTML);

    expect(data.magistradoPonente).toBe('JUAN PÉREZ GARCÍA');
    expect(data.magistradosTribunal).toBe('MARÍA LÓPEZ; PEDRO SOTO');
    expect(data.sentidoFallo).toBe('FUNDADA EN PARTE');
    expect(data.jurisprudenciaNacional).toBe('CASACIÓN N° 123-2020');
    expect(data.distritoJudicial).toBe('LIMA');
    expect(data.normaDerechoInterno).toBe('ART. 1° CONSTITUCIÓN');
  });
});

describe('PjScraper.parseFichaHtml (formato real del popup)', () => {
  it('extrae campos desde el grid Bootstrap del popup', () => {
    const scraper = new PjScraper({} as any, {} as any, '.', '.');
    const data = scraper.parseFichaHtml(SAMPLE_FICHA_GRID_HTML);

    expect(data.magistradoPonente).toBe('MAGISTRADO PONENTE');
    expect(data.magistradosTribunal).toBe('MAGISTRADO A, MAGISTRADO B');
    expect(data.sentidoFallo).toBe('Confirmada');
    expect(data.jurisprudenciaNacional).toBe('ACUERDO PLENARIO N° 1');
    expect(data.distritoJudicial).toBe('Lima');
    expect(data.normaDerechoInterno).toBe('ART. 2°');
  });

  it('devuelve campos vacíos cuando el popup no tiene contenido', () => {
    const scraper = new PjScraper({} as any, {} as any, '.', '.');
    const data = scraper.parseFichaHtml('<div id="formBuscador:popupResolucion"></div>');
    expect(data.magistradoPonente).toBe('');
    expect(data.magistradosTribunal).toBe('');
  });
});

describe('PjScraper.extractFichaLinkParams', () => {
  it('extrae source y parametros del enlace Ver ficha', () => {
    const scraper = new PjScraper({} as any, {} as any, '.', '.');
    const { source, params } = scraper.extractFichaLinkParams(SAMPLE_RESULT_HTML, '39596387-9c0e-4565-acbd-09bd1b98842c');

    expect(source).toBe('formBuscador:repeat:0:j_idt503');
    expect(params.uuid).toBe('39596387-9c0e-4565-acbd-09bd1b98842c');
  });
});
