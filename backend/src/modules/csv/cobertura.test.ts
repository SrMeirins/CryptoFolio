import { describe, expect, it } from 'vitest';
import { calcularCobertura, compararCobertura, type RangoImportacion } from './cobertura';

// Cobertura temporal (#328). Datos sintéticos.
const r = (desde: string, hasta: string, transacciones = 10, nuevo = false): RangoImportacion =>
  ({ importId: nuevo ? null : `${desde}`, archivo: `${desde}.csv`, desde, hasta, transacciones, nuevo });
const HOY = '2026-10-20';

describe('calcularCobertura', () => {
  it('une solapes y separaciones cortas, y detecta huecos de más de 7 días', () => {
    const c = calcularCobertura('binance', [r('2024-01-01', '2024-03-31'), r('2024-03-15', '2024-06-30', 5), r('2024-07-05', '2024-08-31'), r('2024-10-01', '2026-10-18')], [], HOY)!;
    expect(c.tramos.map(t => [t.desde, t.hasta, t.transacciones])).toEqual([['2024-01-01', '2024-08-31', 25], ['2024-10-01', '2026-10-18', 10]]);
    expect(c.huecos).toEqual([{ desde: '2024-09-01', hasta: '2024-09-30', dias: 30, revisionId: null }]);
    expect(c.pendiente).toBeNull();
  });

  it('exactamente 7 días sin datos no es hueco; 8 sí', () => {
    expect(calcularCobertura('binance', [r('2024-01-01', '2024-01-10'), r('2024-01-18', '2024-02-01')], [], '2024-02-01')!.huecos).toHaveLength(0);
    expect(calcularCobertura('binance', [r('2024-01-01', '2024-01-10'), r('2024-01-19', '2024-02-01')], [], '2024-02-01')!.huecos[0].dias).toBe(8);
  });

  it('pendiente hasta hoy y revisiones (con caducidad de la marca de pendiente)', () => {
    const rangos = [r('2022-02-15', '2024-05-31'), r('2024-07-01', '2026-06-16')];
    const c = calcularCobertura('binance', rangos, [], HOY)!;
    expect(c.pendiente).toEqual({ desde: '2026-06-17', hasta: HOY, dias: 126, revisionId: null });
    const revisiones = [
      { id: 'h', tipo: 'hueco' as const, desde: '2024-05-01', hasta: '2024-07-15', revisadoEn: '2026-10-01T00:00:00Z' },
      { id: 'p', tipo: 'pendiente' as const, desde: '2026-06-17', hasta: '2026-10-01', revisadoEn: '2026-10-01T00:00:00Z' },
    ];
    const rev = calcularCobertura('binance', rangos, revisiones, HOY)!;
    expect(rev.huecos[0].revisionId).toBe('h');
    expect(rev.pendiente?.revisionId).toBe('p');
    expect(calcularCobertura('binance', rangos, revisiones, '2026-12-15')!.pendiente?.revisionId).toBeNull();
  });

  it('sin importaciones no hay cobertura', () => {
    expect(calcularCobertura('bitvavo', [], [], HOY)).toBeNull();
  });
});

describe('compararCobertura', () => {
  const base = [r('2022-01-01', '2023-12-31'), r('2024-06-01', '2026-06-16')];
  const antes = calcularCobertura('binance', base, [], HOY);

  it('rellena un hueco y pone al día', () => {
    const despues = calcularCobertura('binance', [...base, r('2024-01-01', '2024-05-31', 3, true), r('2026-06-17', '2026-10-19', 2, true)], [], HOY)!;
    expect(compararCobertura(antes, despues).map(e => e.tipo)).toEqual(['rellena', 'al_dia']);
  });

  it('rellena en parte y avanza, y avisa de un hueco nuevo', () => {
    const despues = calcularCobertura('binance', [...base, r('2024-02-01', '2024-03-31', 3, true), r('2026-07-01', '2026-08-31', 2, true)], [], HOY)!;
    const e = compararCobertura(antes, despues);
    expect(e.map(x => x.tipo)).toEqual(['rellena_parte', 'deja_hueco', 'avanza']);
    expect(e.find(x => x.tipo === 'deja_hueco')).toMatchObject({ desde: '2026-06-17', hasta: '2026-06-30', dias: 14 });
  });

  it('primera importación de un exchange: solo los huecos que deja el propio lote', () => {
    const despues = calcularCobertura('bitvavo', [r('2025-01-01', '2025-03-31', 1, true), r('2025-06-01', '2026-10-19', 1, true)], [], HOY)!;
    const e = compararCobertura(null, despues);
    expect(e.map(x => x.tipo)).toEqual(['primera', 'deja_hueco']);
    expect(e[0]).toMatchObject({ desde: '2025-01-01', hasta: '2026-10-19', dias: 0 });
  });
});

describe('avisosCobertura (#328)', () => {
  it('avisa del pendiente de más de 60 días sin revisar y cuenta los huecos sin revisar', async () => {
    const { avisosCobertura } = await import('./coberturaAvisos');
    const c = calcularCobertura('binance', [r('2022-02-15', '2024-05-31'), r('2024-07-01', '2026-06-16')], [], HOY)!;
    const avisos = avisosCobertura([c]);
    expect(avisos.map(a => a.id)).toEqual(['import-stale-binance', 'import-huecos']);
    expect(avisos[0].message).toMatch(/hace 4 meses/);
    expect(avisos[1]).toMatchObject({ count: 1 });
    const revisado = { ...c, pendiente: { ...c.pendiente!, revisionId: 'x' }, huecos: c.huecos.map(h => ({ ...h, revisionId: 'y' })) };
    expect(avisosCobertura([revisado])).toEqual([]);
  });
});
