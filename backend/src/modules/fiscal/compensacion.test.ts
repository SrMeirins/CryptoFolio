import { describe, expect, it } from 'vitest';
import { compensarPerdidas, type AnioFiscal } from './compensacion';

// Compensación de pérdidas por año de origen (#305). Datos sintéticos.
const anios = (desde: number, valores: Array<[number, number]>): AnioFiscal[] =>
  valores.map(([netoGP, rendimientos], i) => ({ year: desde + i, netoGP, rendimientos }));

const cuadra = (o: { original: number; compensadoPatrim: number; compensadoRend: number; pendiente: number; caducado: number }) =>
  expect(o.compensadoPatrim + o.compensadoRend + o.pendiente + o.caducado).toBeCloseTo(o.original, 9);

describe('compensarPerdidas — orígenes y caducidad', () => {
  it('se puede compensar justo en el 4.º ejercicio siguiente', () => {
    const r = compensarPerdidas(anios(2020, [[-100, 0], [0, 0], [0, 0], [0, 0], [60, 0]]));
    expect(r.origenes[0]).toMatchObject({ year: 2020, original: 100, compensadoPatrim: 60, pendiente: 40, caducado: 0, caducaEn: 2024 });
    expect(r.pendienteTotal).toBeCloseTo(40, 9);
    cuadra(r.origenes[0]);
  });

  it('al 5.º ejercicio lo pendiente caduca y ya no compensa', () => {
    const r = compensarPerdidas(anios(2020, [[-100, 0], [30, 0], [0, 0], [0, 0], [0, 0], [500, 0]]));
    expect(r.origenes[0]).toMatchObject({ compensadoPatrim: 30, pendiente: 0, caducado: 70 });
    expect(r.detalle.at(-1)).toMatchObject({ compensadoPatrim: 0, netoDespues: 500 });
    expect(r.pendienteTotal).toBe(0);
    cuadra(r.origenes[0]);
  });

  it('consume primero la más antigua', () => {
    const r = compensarPerdidas(anios(2021, [[-50, 0], [-80, 0], [70, 0]]));
    expect(r.origenes.map(o => `${o.year}:${o.pendiente}`)).toEqual(['2021:0', '2022:60']);
    r.origenes.forEach(cuadra);
  });

  it('contra rendimientos con el límite del 25 %', () => {
    const r = compensarPerdidas(anios(2022, [[-100, 0], [0, 40]]));
    expect(r.origenes[0]).toMatchObject({ compensadoRend: 10, pendiente: 90 });
    expect(r.detalle[1].compensadoRend).toBe(10);
  });

  it('sin pérdidas: sin orígenes y el detalle no cambia', () => {
    const r = compensarPerdidas(anios(2024, [[100, 0], [50, 8]]));
    expect(r.origenes).toEqual([]);
    expect(r.detalle[1]).toMatchObject({ netoDespues: 50, compensado: 0 });
  });
});
