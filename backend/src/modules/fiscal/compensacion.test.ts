import { describe, expect, it } from 'vitest';
import { baseAhorro, compensarPerdidas, type AnioFiscal } from './compensacion';

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

  it('la pérdida del año en curso es provisional y no suma al pendiente (#534)', () => {
    // 2022 cerrado con pérdida; 2024 (último ejercicio, el año en curso) también con pérdida.
    const r = compensarPerdidas(anios(2022, [[-100, 0], [30, 0], [-50, 0]]));
    expect(r.origenes.map(o => `${o.year}:${o.pendiente}:${o.provisional}`)).toEqual(['2022:70:false', '2024:50:true']);
    expect(r.pendienteTotal).toBeCloseTo(70, 9);
    expect(r.pendienteProvisional).toBeCloseTo(50, 9);
  });

  it('sin pérdida en el año en curso: provisional 0 y el total no cambia', () => {
    const r = compensarPerdidas(anios(2023, [[-40, 0], [10, 0]]));
    expect(r.pendienteTotal).toBeCloseTo(30, 9);
    expect(r.pendienteProvisional).toBe(0);
    expect(r.origenes.every(o => !o.provisional)).toBe(true);
  });

  it('sin pérdidas: sin orígenes y el detalle no cambia', () => {
    const r = compensarPerdidas(anios(2024, [[100, 0], [50, 8]]));
    expect(r.origenes).toEqual([]);
    expect(r.detalle[1]).toMatchObject({ netoDespues: 50, compensado: 0 });
  });

  it('fase 1 (art. 49): la pérdida del año compensa el 25 % de sus propios rendimientos', () => {
    const r = compensarPerdidas(anios(2025, [[-100, 40]]));
    expect(r.detalle[0]).toMatchObject({ perdida: 100, compensadoRendAnio: 10, compensadoRend: 10, netoDespues: 0 });
    expect(r.origenes[0]).toMatchObject({ original: 100, compensadoRend: 10, pendiente: 90 });
    cuadra(r.origenes[0]);
    // Base del ahorro: 0 de ganancias + 40 de rendimientos - 10 compensados.
    expect(baseAhorro(r.detalle[0])).toBeCloseTo(30, 9);
  });

  it('el 25 % es conjunto: la fase 1 va primero y las pérdidas anteriores usan lo que queda', () => {
    // 2024 deja 100 pendientes; 2025 pierde 4 y tiene 40 de rendimientos: límite 10.
    const r = compensarPerdidas(anios(2024, [[-100, 0], [-4, 40]]));
    expect(r.detalle[1]).toMatchObject({ compensadoRendAnio: 4, compensadoRend: 10 });
    expect(r.origenes[0]).toMatchObject({ year: 2024, compensadoRend: 6, pendiente: 94 });
    expect(r.origenes[1]).toMatchObject({ year: 2025, compensadoRend: 4, pendiente: 0 });
    r.origenes.forEach(cuadra);
  });

  it('una pérdida del año mayor que el 25 % agota el límite: las anteriores no compensan con rendimientos', () => {
    const r = compensarPerdidas(anios(2024, [[-100, 0], [-50, 40]]));
    expect(r.detalle[1]).toMatchObject({ compensadoRendAnio: 10, compensadoRend: 10, compensadoPatrim: 0 });
    expect(r.origenes[0]).toMatchObject({ compensadoRend: 0, pendiente: 100 });
    expect(r.origenes[1]).toMatchObject({ compensadoRend: 10, pendiente: 40 });
  });

  it('con saldo positivo de ganancias no hay fase 1: las anteriores compensan ganancias y luego el 25 %', () => {
    const r = compensarPerdidas(anios(2024, [[-200, 0], [150, 40]]));
    expect(r.detalle[1]).toMatchObject({ compensadoRendAnio: 0, compensadoPatrim: 150, compensadoRend: 10, netoDespues: 0 });
    expect(r.origenes[0]).toMatchObject({ pendiente: 40 });
  });

  it('guarda en qué ejercicio se compensó cada pérdida y con qué (#541)', () => {
    // 2022 pierde 100; 2023 gana 30; 2024 tiene 40 de rendimientos (25 % = 10) y gana 20.
    const r = compensarPerdidas(anios(2022, [[-100, 0], [30, 0], [20, 40]]));
    expect(r.origenes[0].aplicaciones).toEqual([
      { year: 2023, patrim: 30, rend: 0 },
      { year: 2024, patrim: 20, rend: 10 },
    ]);
    const suma = r.origenes[0].aplicaciones.reduce((t, a) => t + a.patrim + a.rend, 0);
    expect(suma).toBeCloseTo(r.origenes[0].compensadoPatrim + r.origenes[0].compensadoRend, 9);
  });

  it('la fase 1 queda anotada en el propio año de la pérdida', () => {
    const r = compensarPerdidas(anios(2025, [[-100, 40]]));
    expect(r.origenes[0].aplicaciones).toEqual([{ year: 2025, patrim: 0, rend: 10 }]);
  });
});
