import { describe, expect, it } from 'vitest';
import { detectLanguage, normalizeHeaders, languageLabel } from './languages';

// languages.ts no tenía ningún test propio hasta ahora.

describe('detectLanguage', () => {
  it('detecta inglés con las 7 cabeceras canónicas exactas', () => {
    expect(detectLanguage(['User ID', 'Time', 'Account', 'Operation', 'Coin', 'Change', 'Remark'])).toBe('en');
  });

  it('detecta español con las 7 cabeceras traducidas', () => {
    expect(detectLanguage(['ID de usuario', 'Tiempo', 'Cuenta', 'Operación', 'Moneda', 'Cambio', 'Observación'])).toBe('es');
  });

  it('detecta español aunque falten columnas, mientras lleguen al umbral (5 de 7)', () => {
    expect(detectLanguage(['ID de usuario', 'Tiempo', 'Cuenta', 'Operación', 'Moneda'])).toBe('es');
  });

  it('por debajo del umbral (4 de 7): unknown', () => {
    expect(detectLanguage(['ID de usuario', 'Tiempo', 'Cuenta', 'Operación'])).toBe('unknown');
  });

  it('cabeceras completamente ajenas: unknown', () => {
    expect(detectLanguage(['Foo', 'Bar', 'Baz'])).toBe('unknown');
  });

  it('ignora espacios sobrantes al comparar', () => {
    expect(detectLanguage([' User ID ', ' Time ', ' Account ', ' Operation ', ' Coin ', ' Change ', ' Remark '])).toBe('en');
  });
});

describe('normalizeHeaders', () => {
  it('traduce cabeceras en español a sus equivalentes canónicos en inglés', () => {
    const result = normalizeHeaders(['ID de usuario', 'Tiempo', 'Cuenta'], 'es');
    expect(result).toEqual(['User ID', 'Time', 'Account']);
  });

  it('deja las cabeceras sin cambios si el idioma es inglés', () => {
    const headers = ['User ID', 'Time', 'Account'];
    expect(normalizeHeaders(headers, 'en')).toEqual(headers);
  });

  it('deja las cabeceras sin cambios si el idioma es unknown', () => {
    const headers = ['Foo', 'Bar'];
    expect(normalizeHeaders(headers, 'unknown')).toEqual(headers);
  });

  it('una cabecera en español sin mapeo conocido se deja tal cual', () => {
    const result = normalizeHeaders(['ID de usuario', 'ColumnaRara'], 'es');
    expect(result).toEqual(['User ID', 'ColumnaRara']);
  });
});

describe('languageLabel', () => {
  it('devuelve el nombre legible de cada idioma soportado', () => {
    expect(languageLabel('en')).toBe('Inglés');
    expect(languageLabel('es')).toBe('Español');
    expect(languageLabel('unknown')).toBe('Desconocido');
  });
});
