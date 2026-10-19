import { describe, expect, it } from 'vitest';
import { compararCifras, obligacion721, type CifrasRenta } from './declaraciones';

// Ejercicios declarados (#311). Datos sintéticos.
const base: CifrasRenta = { ganancias: 100, perdidas: -40, neto: 60, rendimientos: 5, operaciones: 12, base: 65, cuota: 12.35 };

describe('compararCifras', () => {
  it('sin cambios por debajo del céntimo', () => {
    expect(compararCifras(base, { ...base, neto: 60.004 })).toEqual([]);
  });
  it('lista cada cifra que cambió', () => {
    expect(compararCifras(base, { ...base, ganancias: 150, neto: 110, operaciones: 13 })).toEqual([
      { campo: 'ganancias', declarado: 100, actual: 150 },
      { campo: 'neto', declarado: 60, actual: 110 },
      { campo: 'operaciones', declarado: 12, actual: 13 },
    ]);
  });
  it('una cifra que faltaba cuenta como 0', () => {
    expect(compararCifras({ ...base, cuota: undefined }, base)).toEqual([{ campo: 'cuota', declarado: 0, actual: 12.35 }]);
  });
});

describe('obligacion721 — regla del incremento de 20.000 €', () => {
  it('sin presentación previa basta con superar el umbral', () => {
    expect(obligacion721(50_001, 50_000, null)).toBe(true);
    expect(obligacion721(50_000, 50_000, null)).toBe(false);
  });
  it('con presentación previa solo si aumenta más de 20.000 €', () => {
    const ultima = { ejercicio: 2024, valor: 60_000 };
    expect(obligacion721(80_000, 50_000, ultima)).toBe(false);
    expect(obligacion721(80_001, 50_000, ultima)).toBe(true);
    expect(obligacion721(55_000, 50_000, ultima)).toBe(false);
  });
});
