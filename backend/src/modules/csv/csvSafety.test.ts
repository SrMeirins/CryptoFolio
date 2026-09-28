import { describe, expect, it } from 'vitest';
import { sanitizeCsvField } from './csvSafety';

describe('sanitizeCsvField — mitigación de CSV Formula Injection (OWASP)', () => {
  it('antepone comilla simple a valores que empiezan por =', () => {
    // Las comillas simples internas del payload no son el delimitador ';' ni
    // comillas dobles, así que no disparan el envolvido RFC 4180 — solo se
    // añade la comilla simple inicial que fuerza texto en Excel/LibreOffice.
    expect(sanitizeCsvField('=cmd|\'/c calc\'!A0')).toBe('\'=cmd|\'/c calc\'!A0');
  });

  it('antepone comilla simple a valores que empiezan por +', () => {
    expect(sanitizeCsvField('+1+1')).toBe('\'+1+1');
  });

  it('antepone comilla simple a valores que empiezan por -', () => {
    expect(sanitizeCsvField('-2+3')).toBe('\'-2+3');
  });

  it('antepone comilla simple a valores que empiezan por @', () => {
    expect(sanitizeCsvField('@SUM(A1:A2)')).toBe('\'@SUM(A1:A2)');
  });

  it('antepone comilla simple a valores que empiezan por tabulador', () => {
    expect(sanitizeCsvField('\t=1+1')).toBe('\'\t=1+1');
  });

  it('antepone comilla simple a valores que empiezan por retorno de carro y los envuelve (el \\r también rompe RFC 4180)', () => {
    expect(sanitizeCsvField('\r=1+1')).toBe('"\'\r=1+1"');
  });

  it('no toca un símbolo de activo normal', () => {
    expect(sanitizeCsvField('BTC')).toBe('BTC');
  });

  it('envuelve entre comillas dobles un valor con el delimitador ;', () => {
    expect(sanitizeCsvField('XRP;extra')).toBe('"XRP;extra"');
  });

  it('escapa comillas dobles internas (RFC 4180) y envuelve el valor', () => {
    expect(sanitizeCsvField('Activo "raro"')).toBe('"Activo ""raro"""');
  });

  it('envuelve un valor con salto de línea', () => {
    expect(sanitizeCsvField('linea1\nlinea2')).toBe('"linea1\nlinea2"');
  });

  it('combina ambas protecciones: fórmula + delimitador en el mismo valor', () => {
    // Tras anteponer la comilla, el valor contiene ';' → también se envuelve
    // y se escapan las comillas internas (incluida la que forzaba texto).
    expect(sanitizeCsvField('=1+1;otra_col')).toBe('"\'=1+1;otra_col"');
  });
});
