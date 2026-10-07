import { describe, expect, it } from 'vitest';
import { validateBitvavoCsvStructure } from './bitvavoValidator';

// validateBitvavoCsvStructure no tenía ningún test propio hasta ahora.

const HEADER = 'Timezone,Date,Time,Type,Currency,Amount,Quote Currency,Quote Price,Received / Paid Currency,Received / Paid Amount,Fee currency,Fee amount,Status,Transaction ID,Address';

function csv(rows: string[]): Buffer {
  return Buffer.from([HEADER, ...rows].join('\n'), 'utf-8');
}

describe('validateBitvavoCsvStructure', () => {
  it('CSV válido con tipos conocidos: valid=true, sin errores', () => {
    const result = validateBitvavoCsvStructure(csv([
      'Europe/Madrid,2024-01-01,10:00:00,deposit,EUR,500,,,,,,,Completed,tx-1,',
      'Europe/Madrid,2024-01-02,10:00:00,withdrawal,BTC,-0.1,,,,,,,Completed,tx-2,',
    ]));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.rowCount).toBe(2);
  });

  it('archivo vacío o solo con cabeceras: error explícito', () => {
    const result = validateBitvavoCsvStructure(Buffer.from(HEADER, 'utf-8'));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/vacío/);
  });

  it('falta una columna requerida: error explícito mencionando la columna', () => {
    const badHeader = 'Timezone,Date,Time,Type,Currency,Amount'; // sin el resto de columnas
    const result = validateBitvavoCsvStructure(Buffer.from(
      [badHeader, 'Europe/Madrid,2024-01-01,10:00:00,deposit,EUR,500'].join('\n'), 'utf-8'
    ));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Columna requerida no encontrada'))).toBe(true);
  });

  it('tipo de operación desconocido: BLOQUEA (error, a diferencia de Binance que solo avisa)', () => {
    const result = validateBitvavoCsvStructure(csv([
      'Europe/Madrid,2024-01-01,10:00:00,staking,BNB,10,,,,,,,Completed,tx-1,',
    ]));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('staking'))).toBe(true);
  });

  it('fila con Amount no numérico: se cuenta como malformada, warning', () => {
    const result = validateBitvavoCsvStructure(csv([
      'Europe/Madrid,2024-01-01,10:00:00,deposit,EUR,no-es-un-numero,,,,,,,Completed,tx-1,',
      'Europe/Madrid,2024-01-02,10:00:00,deposit,EUR,100,,,,,,,Completed,tx-2,',
    ]));
    expect(result.rowCount).toBe(1);
    expect(result.warnings.some(w => w.includes('formato incorrecto'))).toBe(true);
  });

  it('calcula el rango de fechas correctamente', () => {
    const result = validateBitvavoCsvStructure(csv([
      'Europe/Madrid,2024-03-15,10:00:00,deposit,EUR,100,,,,,,,Completed,tx-1,',
      'Europe/Madrid,2024-01-01,10:00:00,deposit,EUR,100,,,,,,,Completed,tx-2,',
    ]));
    expect(result.dateRange).toEqual({ from: '2024-01-01', to: '2024-03-15' });
  });

  it('ninguna fila válida: error explícito', () => {
    const result = validateBitvavoCsvStructure(csv([
      'Europe/Madrid,2024-01-01,10:00:00,deposit,EUR,no-es-un-numero,,,,,,,Completed,tx-1,',
    ]));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('No se encontraron filas válidas'))).toBe(true);
  });
});
