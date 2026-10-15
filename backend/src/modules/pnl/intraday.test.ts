import { describe, expect, it, vi } from 'vitest';
import { QUARTER_MS } from '../prices/intradayPrices';

// Evolución intradía de 24 h (#215).
const { seriesMock, eventsMock, flowsMock, liveMock } = vi.hoisted(() => ({
  seriesMock: vi.fn(),
  eventsMock: vi.fn(),
  flowsMock: vi.fn(),
  liveMock: vi.fn(),
}));
vi.mock('../prices/intradayPrices', async (orig) => ({
  ...(await orig<typeof import('../prices/intradayPrices')>()),
  quarterHourPricesEur: seriesMock,
}));
vi.mock('./positions', async (orig) => ({ ...(await orig<typeof import('./positions')>()), loadPositionEvents: eventsMock }));
vi.mock('./capitalFlows', async (orig) => ({ ...(await orig<typeof import('./capitalFlows')>()), loadCapitalFlows: flowsMock }));
vi.mock('../prices/liveFeed', () => ({ getAllLivePrices: liveMock }));

const { intradayInstants, pricesAtInstants, buildIntradaySeries, getIntradayPnl } = await import('./intraday');

const NOW = Date.UTC(2026, 9, 15, 10, 7, 30);   // 10:07:30 UTC

describe('intradayInstants', () => {
  it('cuartos de hora desde hace 24 h y el instante actual al final', () => {
    const t = intradayInstants(NOW);
    expect(t.at(-1)).toBe(NOW);
    expect(t[0]).toBe(Date.UTC(2026, 9, 14, 10, 0));
    expect(t.slice(0, -1).every(x => x % QUARTER_MS === 0)).toBe(true);
    expect(new Set(t.slice(1, -1).map((x, i) => x - t[i]))).toEqual(new Set([QUARTER_MS]));
    expect(t.length).toBe(98);
  });
  it('sin duplicar el instante actual si cae justo en un cuarto de hora', () => {
    const exact = Date.UTC(2026, 9, 15, 10, 0);
    expect(intradayInstants(exact).filter(x => x === exact)).toHaveLength(1);
  });
});

describe('pricesAtInstants', () => {
  const inst = [0, 1, 2, 3];
  it('exacto, arrastre del último conocido y precio en vivo al final', () => {
    expect(pricesAtInstants(inst, new Map([[0, 10], [2, 12]]), 13)).toEqual([10, 10, 12, 13]);
  });
  it('rellena el principio con el primer dato y, sin serie, usa el precio en vivo en toda la ventana', () => {
    expect(pricesAtInstants(inst, new Map([[2, 12]]), undefined)).toEqual([12, 12, 12, 12]);
    expect(pricesAtInstants(inst, null, 5)).toEqual([5, 5, 5, 5]);
    expect(pricesAtInstants(inst, null, undefined)).toEqual([null, null, null, null]);
  });
});

describe('buildIntradaySeries', () => {
  const instants = [0, 1, 2];
  it('el P&L sigue al precio y un depósito no es ganancia', () => {
    const holdings = [new Map([['BTC', 1]]), new Map([['BTC', 1], ['EUR', 50]]), new Map([['BTC', 1], ['EUR', 50]])];
    const prices = [100, 110, 99];
    const r = buildIntradaySeries({
      instants, holdings,
      flows: [{ asset: 'EUR', at: 1, quantity: 50, kind: 'capital' }],
      priceOf: (a, i) => (a === 'BTC' ? prices[i] : null),
      fxAt: () => 1,
    });
    expect(r.points.map(p => p.value)).toEqual([100, 160, 149]);
    expect(r.points.map(p => p.pnl)).toEqual([0, 10, -1]);
    expect(r.points[0].pct).toBe(0);
    expect(r.points[1].pct).toBeCloseTo(6.6667, 3);   // 10 sobre 150
    expect(r.points.at(-1)?.live).toBe(true);
    expect(r.totalPnl).toBe(-1);
    // Rentabilidad de cada tramo y flujo de capital propio, para el tooltip y los marcadores (#214).
    expect(r.points.map(p => p.flow)).toEqual([0, 50, 0]);
    expect(r.points.map(p => [p.capitalIn, p.capitalOut])).toEqual([[0, 0], [50, 0], [0, 0]]);
    expect(r.points[0].stepPct).toBeNull();
    expect(r.points[2].stepPct).toBeCloseTo(-6.875, 3);   // −11 sobre 160
  });

  it('los préstamos de margen no se marcan como depósitos', () => {
    const r = buildIntradaySeries({
      instants: [0, 1], holdings: [new Map([['EUR', 10]]), new Map([['EUR', 110]])],
      flows: [{ asset: 'EUR', at: 1, quantity: 100, kind: 'margin' }],
      priceOf: () => null, fxAt: () => 1,
    });
    expect(r.points[1]).toMatchObject({ flow: 0, pnl: 0 });
  });
});

describe('getIntradayPnl', () => {
  it('valora con las series de 15 min, el precio en vivo al final y marca los activos sin serie', async () => {
    const instants = intradayInstants(NOW);
    eventsMock.mockResolvedValue([
      { asset: 'BTC', at: NOW - 48 * 3_600_000, delta: 1 },
      { asset: 'XYZ', at: NOW - 48 * 3_600_000, delta: 10 },
    ]);
    flowsMock.mockResolvedValue([]);
    liveMock.mockReturnValue(new Map([['BTC', 120], ['XYZ', 2]]));
    seriesMock.mockImplementation(async (asset: string) =>
      asset === 'BTC' ? new Map(instants.map(t => [t, 100])) : null);

    const r = await getIntradayPnl('EUR', NOW);
    expect(r.stepMinutes).toBe(15);
    expect(r.points).toHaveLength(98);
    expect(r.points[0]).toMatchObject({ value: 120, pnl: 0 });       // 1 BTC a 100 + 10 XYZ a 2 (en vivo)
    expect(r.points.at(-1)).toMatchObject({ value: 140, pnl: 20, live: true });
    expect(r.approximate).toEqual(['XYZ']);
    expect(r.to).toBe(new Date(NOW).toISOString());
  });
});
