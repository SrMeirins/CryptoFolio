import { describe, expect, it } from 'vitest';
import { calcularIrpfAhorro, desgloseMarginal } from './irpf';
import { escalaOficial } from './escalasAhorro';

describe('irpf', () => {
  it('310.000€ con los tipos vigentes (30% último tramo) = 74.880€', () => {
    expect(calcularIrpfAhorro(310_000)).toBeCloseTo(74_880, 2);
  });
  it('base ≤ 0 → 0', () => {
    expect(calcularIrpfAhorro(0)).toBe(0);
    expect(calcularIrpfAhorro(-5)).toBe(0);
  });
  it('redondea a céntimos — sin ruido de float en casos reales', () => {
    // Antes del redondeo: 89.02069999999999 (suma de tramos con floats).
    expect(calcularIrpfAhorro(468.53)).toBe(89.02);
  });
  it('cada ejercicio con su escala oficial (#452)', () => {
    // 310.000 € de base: 6.000 al 19 %, 44.000 al 21 %, 150.000 al 23 %, y el resto según el año.
    expect(calcularIrpfAhorro(310_000, escalaOficial(2020))).toBeCloseTo(1_140 + 9_240 + 260_000 * 0.23, 2);
    expect(calcularIrpfAhorro(310_000, escalaOficial(2022))).toBeCloseTo(1_140 + 9_240 + 34_500 + 110_000 * 0.26, 2);
    expect(calcularIrpfAhorro(310_000, escalaOficial(2024))).toBeCloseTo(1_140 + 9_240 + 34_500 + 27_000 + 10_000 * 0.28, 2);
    expect(calcularIrpfAhorro(310_000, escalaOficial(2025))).toBeCloseTo(74_880, 2);
  });
  it('el desglose marginal sigue los tramos del año', () => {
    const d = desgloseMarginal(190_000, 210_000, escalaOficial(2022));
    expect(d.map(t => t.tipo)).toEqual([23, 26]);
  });
});
