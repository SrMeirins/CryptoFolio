import { describe, expect, it } from 'vitest';
import { compararCifras, type CifrasRenta } from './declaraciones';

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
