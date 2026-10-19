import { describe, expect, it } from 'vitest';
import { colchonSinTributar, cuotaConExtra } from './planificador';
import type { AnioFiscal } from './compensacion';

// Planificador de fin de año (#307). Datos sintéticos; tipos por defecto.
const TIPOS = [19, 21, 23, 27, 30];
const Y = 2026;
const rows = (pairs: Array<[number, number, number]>): AnioFiscal[] => pairs.map(([year, netoGP, rendimientos]) => ({ year, netoGP, rendimientos }));

describe('cuotaConExtra', () => {
  it('19 % sobre la base del ahorro y compensa pérdidas del año', () => {
    expect(cuotaConExtra(rows([[Y, 0, 0]]), Y, TIPOS, 1_000)).toBeCloseTo(190, 2);
    expect(cuotaConExtra(rows([[Y, -300, 0]]), Y, TIPOS, 1_000)).toBeCloseTo(133, 2);
    expect(cuotaConExtra(rows([[Y, 0, 0]]), Y, TIPOS, -500)).toBe(0);
  });
});

describe('colchonSinTributar', () => {
  it('sin rendimientos: pérdidas del año más pendientes vigentes', () => {
    const anios = rows([[Y - 2, -400, 0], [Y - 1, 0, 0], [Y, -100, 0]]);
    expect(colchonSinTributar(anios, Y)).toBeCloseTo(500, 2);
    // Realizar el colchón no cambia la cuota; un céntimo más, sí.
    expect(cuotaConExtra(anios, Y, TIPOS, 500)).toBe(0);
    expect(cuotaConExtra(anios, Y, TIPOS, 500.1)).toBeGreaterThan(0);
  });

  it('con rendimientos: la cuota sube antes de agotar las pendientes', () => {
    // 100 pendientes; 40 de rendimientos → hoy compensan 10 (25 %) y tributan 30.
    const anios = rows([[Y - 1, -100, 0], [Y, 0, 40]]);
    const base = cuotaConExtra(anios, Y, TIPOS, 0);
    expect(base).toBeCloseTo(30 * 0.19, 2);
    const c = colchonSinTributar(anios, Y);
    expect(c).toBeCloseTo(90, 1);
    expect(cuotaConExtra(anios, Y, TIPOS, c)).toBeCloseTo(base, 2);
    expect(cuotaConExtra(anios, Y, TIPOS, c + 1)).toBeGreaterThan(base);
  });

  it('sin pérdidas: colchón 0', () => {
    expect(colchonSinTributar(rows([[Y, 200, 0]]), Y)).toBe(0);
  });
});
