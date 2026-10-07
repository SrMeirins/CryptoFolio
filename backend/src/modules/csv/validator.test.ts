import { describe, expect, it } from 'vitest';
import { validateCsvStructure } from './validator';

// validateCsvStructure no tenía ningún test propio hasta ahora.

const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';

function csv(rows: string[]): Buffer {
  return Buffer.from([HEADER, ...rows].join('\n'), 'utf-8');
}

describe('validateCsvStructure', () => {
  it('CSV válido con filas conocidas: valid=true, sin errores', () => {
    const result = validateCsvStructure(csv([
      '123,2024-01-01 10:00:00,Spot,Deposit,BTC,1,',
      '123,2024-01-02 10:00:00,Spot,Withdraw,BTC,-0.5,',
    ]));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.rowCount).toBe(2);
    expect(result.detectedLanguage).toBe('en');
  });

  it('archivo vacío o solo con cabeceras: error explícito', () => {
    const result = validateCsvStructure(Buffer.from(HEADER, 'utf-8'));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/vacío/);
  });

  it('cabeceras no reconocidas: idioma unknown, error explícito con las cabeceras detectadas', () => {
    const result = validateCsvStructure(Buffer.from('Foo,Bar,Baz\n1,2,3', 'utf-8'));
    expect(result.valid).toBe(false);
    expect(result.detectedLanguage).toBe('unknown');
    expect(result.errors.some(e => e.includes('idioma'))).toBe(true);
  });

  it('CSV en español: cabeceras normalizadas, warning de idioma no inglés', () => {
    const esHeader = 'ID de usuario,Tiempo,Cuenta,Operación,Moneda,Cambio,Observación';
    const result = validateCsvStructure(Buffer.from(
      [esHeader, '123,2024-01-01 10:00:00,Spot,Depósito,BTC,1,'].join('\n'), 'utf-8'
    ));
    expect(result.detectedLanguage).toBe('es');
    expect(result.warnings.some(w => w.includes('normalizadas'))).toBe(true);
  });

  it('operación desconocida: NO bloquea (warning, modo degradado), no error', () => {
    const result = validateCsvStructure(csv([
      '123,2024-01-01 10:00:00,Spot,Operacion Futura Desconocida,BTC,1,',
    ]));
    expect(result.valid).toBe(true);
    expect(result.unknownOperations).toContain('Operacion Futura Desconocida');
    expect(result.warnings.some(w => w.includes('Operacion Futura Desconocida'))).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('fila con Change no numérico: se cuenta como malformada, warning', () => {
    const result = validateCsvStructure(csv([
      '123,2024-01-01 10:00:00,Spot,Deposit,BTC,no-es-un-numero,',
      '123,2024-01-02 10:00:00,Spot,Deposit,BTC,1,',
    ]));
    expect(result.rowCount).toBe(1); // la malformada no cuenta como válida
    expect(result.warnings.some(w => w.includes('formato incorrecto'))).toBe(true);
  });

  it('calcula el rango de fechas correctamente a partir de las filas válidas', () => {
    const result = validateCsvStructure(csv([
      '123,2024-03-15 10:00:00,Spot,Deposit,BTC,1,',
      '123,2024-01-01 10:00:00,Spot,Deposit,BTC,1,',
      '123,2024-06-20 10:00:00,Spot,Deposit,BTC,1,',
    ]));
    expect(result.dateRange).toEqual({ from: '2024-01-01', to: '2024-06-20' });
  });

  it('año de 2 dígitos (formato Binance antiguo) se normaliza correctamente en el rango de fechas', () => {
    const result = validateCsvStructure(csv([
      '123,24-01-01 10:00:00,Spot,Deposit,BTC,1,',
    ]));
    expect(result.dateRange?.from).toBe('2024-01-01');
  });

  it('ninguna fila válida: error explícito', () => {
    const result = validateCsvStructure(csv([
      '123,2024-01-01 10:00:00,Spot,Deposit,BTC,no-es-un-numero,',
    ]));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('No se encontraron filas válidas'))).toBe(true);
  });
});
