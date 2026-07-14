import { describe, it, expect } from 'vitest';
import { extractViewState, extractViewStateFromPartial } from '../parser';

describe('extractViewState', () => {
  it('extrae el ViewState de un HTML', () => {
    const html = '<input type="hidden" name="javax.faces.ViewState" value="123:456" />';
    expect(extractViewState(html)).toBe('123:456');
  });

  it('lanza error si no encuentra ViewState', () => {
    expect(() => extractViewState('<html></html>')).toThrow('No se encontró javax.faces.ViewState');
  });
});

describe('extractViewStateFromPartial', () => {
  it('extrae ViewState de una respuesta parcial', () => {
    const xml = `<?xml version="1.0"?>
<partial-response>
  <changes>
    <update id="javax.faces.ViewState"><![CDATA[abc:def]]></update>
  </changes>
</partial-response>`;
    expect(extractViewStateFromPartial(xml)).toBe('abc:def');
  });
});
