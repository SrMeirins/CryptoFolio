import { describe, expect, it } from 'vitest';
import { acumuladoEn, costeEn } from './costeYNeto';

// Acumulado por instante y coste en USD (#507). Puros, sin base de datos.
describe('acumuladoEn', () => {
  it('suma los movimientos hasta cada instante, sin depender del orden', () => {
    expect(acumuladoEn([30, 10, 20], [{ at: 20, importe: 5 }, { at: 5, importe: 1 }, { at: 25, importe: -2 }])).toEqual([4, 1, 6]);
    expect(acumuladoEn([1, 2], [])).toEqual([0, 0]);
  });
});

describe('costeEn', () => {
  const movs = [
    { at: 1, eur: 100, usdPerEur: 1.1 },   // lote con tipo de apertura
    { at: 2, eur: 50, usdPerEur: null },   // lote sin tipo: tipo del día
    { at: 3, eur: -20, usdPerEur: 1.1 },   // consumo del primero
  ];
  it('en EUR, la suma tal cual', () => {
    expect(costeEn([1, 2, 3], movs, 'EUR', [1, 1, 1])).toEqual([100, 150, 130]);
  });
  it('en USD, cada lote con su tipo y, sin él, con el del día', () => {
    const r = costeEn([1, 2, 3], movs, 'USD', [1.2, 1.25, 1.3]);
    expect(r[0]).toBeCloseTo(110, 9);
    expect(r[1]).toBeCloseTo(110 + 50 * 1.25, 9);
    expect(r[2]).toBeCloseTo(88 + 50 * 1.3, 9);
  });
});
