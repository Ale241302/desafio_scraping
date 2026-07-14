import { describe, it, expect } from 'vitest';
import { responseToString, responseToBuffer } from '../http-client';

describe('responseToString', () => {
  it('convierte Buffer a UTF-8', () => {
    const buffer = Buffer.from('héllo', 'utf-8');
    expect(responseToString(buffer)).toBe('héllo');
  });

  it('convierte ArrayBuffer a string', () => {
    const arrayBuffer = new TextEncoder().encode('test').buffer;
    expect(responseToString(arrayBuffer)).toBe('test');
  });

  it('devuelve string sin modificar', () => {
    expect(responseToString('already string')).toBe('already string');
  });
});

describe('responseToBuffer', () => {
  it('devuelve Buffer sin cambios', () => {
    const buffer = Buffer.from('pdf');
    expect(responseToBuffer(buffer).toString()).toBe('pdf');
  });

  it('convierte string a Buffer', () => {
    const result = responseToBuffer('text');
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.toString()).toBe('text');
  });

  it('convierte ArrayBuffer a Buffer', () => {
    const arrayBuffer = new TextEncoder().encode('bytes').buffer;
    expect(responseToBuffer(arrayBuffer).toString()).toBe('bytes');
  });
});
