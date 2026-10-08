import { describe, expect, it } from 'vitest';
import { computeDailyPnl, valueHoldings, type DayValuation } from './dailyPnl';
import { holdingsAtInstants } from './positions';

const day = (date: string, value: number, inflow = 0, outflow = 0): DayValuation =>
  ({ date, value, inflow, outflow, complete: true, live: false });

describe('computeDailyPnl', () => {
  it('un depósito de capital no cuenta como ganancia', () => {
    const { days } = computeDailyPnl(0, [day('2026-01-10', 1000, 1000)]);
    expect(days[0].pnl).toBe(0);
  });

  it('una retirada de capital no cuenta como pérdida', () => {
    const { days } = computeDailyPnl(1000, [day('2026-01-10', 700, 0, 300)]);
    expect(days[0].pnl).toBe(0);
  });

  it('el % diario usa como base el valor anterior más las entradas del día', () => {
    const { days } = computeDailyPnl(1000, [day('2026-01-10', 1550, 500)]);
    expect(days[0].pnl).toBe(50);
    expect(days[0].pct).toBeCloseTo(50 / 1500 * 100, 4);
  });

  it('la rentabilidad acumulada encadena los % diarios (TWR)', () => {
    const { days, twrPct, totalPnl } = computeDailyPnl(1000, [
      day('2026-01-10', 1100),        // +10 %
      day('2026-01-11', 2090, 1000),  // depósito de 1000 y −5 % sobre 2100
    ]);
    expect(days[0].cumulativePct).toBeCloseTo(10, 4);
    expect(days[1].pct).toBeCloseTo(-10 / 2100 * 100, 4);
    expect(twrPct).toBeCloseTo(((1.1 * (1 - 10 / 2100)) - 1) * 100, 4);
    expect(totalPnl).toBe(90);
  });

  it('Dietz modificado: el P&L se divide entre el capital medio invertido', () => {
    const { days, dietzPct } = computeDailyPnl(1000, [
      day('2026-01-10', 2000, 1000),  // depósito de 1000 al cierre del día 1
      day('2026-01-11', 2100),        // +100
    ]);
    // Día 2: el depósito estuvo invertido la mitad del periodo → base 1000 + 1000 · 1/2.
    expect(days[1].cumulativeDietzPct).toBeCloseTo(100 / 1500 * 100, 4);
    expect(dietzPct).toBeCloseTo(100 / 1500 * 100, 4);
  });

  it('Dietz no se hunde para siempre tras una pérdida total puntual (a diferencia del TWR)', () => {
    const { twrPct, dietzPct } = computeDailyPnl(84, [
      day('2023-09-21', 0.01),          // pérdida casi total (LOST)
      day('2023-09-22', 1000, 1000),    // nueva aportación
      day('2023-09-23', 1100),          // +10 %
    ]);
    expect(twrPct).toBeLessThan(-99);
    expect(dietzPct).toBeGreaterThan(-15);
  });

  it('sin base positiva el % es null y no altera la rentabilidad acumulada', () => {
    const { days, twrPct } = computeDailyPnl(0, [day('2026-01-10', 0)]);
    expect(days[0].pct).toBeNull();
    expect(twrPct).toBe(0);
  });

  it('con una base menor de 1 € el % no se calcula (evita porcentajes desorbitados)', () => {
    const { days, twrPct } = computeDailyPnl(0.002, [day('2026-01-10', 7.6)]);
    expect(days[0].pnl).toBe(7.6);
    expect(days[0].pct).toBeNull();
    expect(twrPct).toBe(0);
  });
});

describe('valueHoldings', () => {
  it('EUR vale 1 y los activos sin precio se excluyen y se listan', () => {
    const r = valueHoldings(new Map([['EUR', 100], ['XRP', 10], ['RARO', 5]]), a => (a === 'XRP' ? 2 : null));
    expect(r.value).toBe(120);
    expect(r.missing).toEqual(['RARO']);
  });
});

describe('holdingsAtInstants', () => {
  it('acumula los eventos hasta cada instante, en cualquier orden de entrada', () => {
    const events = [
      { asset: 'XRP', at: 30, delta: -40 },
      { asset: 'XRP', at: 10, delta: 100 },
      { asset: 'EUR', at: 20, delta: 50 },
    ];
    const [a, b, c] = holdingsAtInstants(events, [15, 25, 35]);
    expect(Object.fromEntries(a)).toEqual({ XRP: 100 });
    expect(Object.fromEntries(b)).toEqual({ XRP: 100, EUR: 50 });
    expect(Object.fromEntries(c)).toEqual({ XRP: 60, EUR: 50 });
  });

  it('descarta las cantidades residuales', () => {
    const [h] = holdingsAtInstants([{ asset: 'XRP', at: 1, delta: 1 }, { asset: 'XRP', at: 2, delta: -1 + 1e-12 }], [3]);
    expect(h.has('XRP')).toBe(false);
  });
});
