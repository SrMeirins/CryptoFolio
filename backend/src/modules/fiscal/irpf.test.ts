import { describe, expect, it } from 'vitest';
import { calcularIrpfAhorro, parseTiposConfig, TIPOS_DEFECTO } from './irpf';

describe('irpf', () => {
  it('310.000€ con los tipos vigentes (30% último tramo) = 74.880€', () => {
    expect(calcularIrpfAhorro(310_000)).toBeCloseTo(74_880, 2);
  });
  it('base ≤ 0 → 0', () => {
    expect(calcularIrpfAhorro(0)).toBe(0);
    expect(calcularIrpfAhorro(-5)).toBe(0);
  });
  it('parseTiposConfig: sin config, corrupta o inválida → defaults', () => {
    expect(parseTiposConfig(undefined)).toEqual(TIPOS_DEFECTO);
    expect(parseTiposConfig('no-json')).toEqual(TIPOS_DEFECTO);
    expect(parseTiposConfig('[1,2,3]')).toEqual(TIPOS_DEFECTO);
    expect(parseTiposConfig('[0,21,23,27,30]')).toEqual(TIPOS_DEFECTO);
  });
  it('parseTiposConfig: config válida se respeta', () => {
    expect(parseTiposConfig('[10,10,10,10,10]')).toEqual([10, 10, 10, 10, 10]);
  });
});
