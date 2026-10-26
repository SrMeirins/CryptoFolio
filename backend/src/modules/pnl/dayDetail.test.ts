import { describe, expect, it, vi } from 'vitest';

// Detalle de un día del calendario (#216).
const { dailyMock, eventsMock, closesMock, liveMock } = vi.hoisted(() => ({
  dailyMock: vi.fn(), eventsMock: vi.fn(), closesMock: vi.fn(), liveMock: vi.fn(),
}));
vi.mock('./pnlService', async (orig) => ({ ...(await orig<typeof import('./pnlService')>()), getDailyPnl: dailyMock }));
vi.mock('./positions', async (orig) => ({ ...(await orig<typeof import('./positions')>()), loadPositionEvents: eventsMock }));
vi.mock('../prices/closePrices', async (orig) => ({ ...(await orig<typeof import('../prices/closePrices')>()), getCachedCloses: closesMock }));
// Zona de la aplicación (#389): la de por defecto, sin base de datos.
vi.mock('../time/appTimezone', async (orig) => ({ ...(await orig<typeof import('../time/appTimezone')>()), getAppTimezone: async () => 'Europe/Madrid' }));
vi.mock('../prices/liveFeed', () => ({ getAllLivePrices: liveMock }));

const { priceContributions, getDayDetail } = await import('./dayDetail');

describe('priceContributions', () => {
  const prices: Record<string, [number, number]> = { BTC: [100, 110], XRP: [2, 1.5] };
  const price = (a: string, w: 'prev' | 'day') => (prices[a] ? prices[a][w === 'prev' ? 0 : 1] : null);

  it('cantidad al cierre anterior × variación del precio, de mayor a menor', () => {
    const c = priceContributions(new Map([['BTC', 2], ['XRP', 100], ['EUR', 50]]), price, { prev: 1, day: 1 });
    expect(c).toEqual([{ asset: 'BTC', pnl: 20 }, { asset: 'XRP', pnl: -50 }]);   // el EUR no varía en EUR
  });

  it('agrupa los alias en su activo de precio y omite los activos sin precio', () => {
    const c = priceContributions(new Map([['WBTC', 1], ['BTC', 1], ['RARO', 9]]), price, { prev: 1, day: 1 });
    expect(c).toEqual([{ asset: 'BTC', pnl: 20 }]);
  });

  it('en USD incluye el efecto divisa del saldo en EUR', () => {
    const c = priceContributions(new Map([['EUR', 100]]), price, { prev: 1.1, day: 1.2 });
    expect(c).toEqual([{ asset: 'EUR', pnl: 10 }]);
  });
});

describe('getDayDetail', () => {
  const NOW = Date.UTC(2026, 9, 15, 12);
  const day = { date: '2026-10-10', value: 230, pnl: 15, pct: 7, inflow: 0, outflow: 0, complete: true, live: false };

  it('la suma de aportaciones y el resto cuadra con el P&L del día', async () => {
    dailyMock.mockResolvedValue({ days: [day] });
    eventsMock.mockResolvedValue([{ asset: 'BTC', at: Date.UTC(2026, 9, 1), delta: 2 }]);
    closesMock.mockResolvedValue(new Map([['BTC', new Map([['2026-10-09', 100], ['2026-10-10', 105]])]]));
    liveMock.mockReturnValue(new Map());
    const r = await getDayDetail('2026-10-10', 'EUR', NOW);
    expect(r).toMatchObject({ date: '2026-10-10', pnl: 15, contributions: [{ asset: 'BTC', pnl: 10 }], other: 5 });
    expect(closesMock).toHaveBeenCalledWith(['BTC'], '2026-10-09', '2026-10-10', 'Europe/Madrid');
  });

  it('hoy usa el precio en vivo; sin actividad ese día devuelve null', async () => {
    dailyMock.mockResolvedValue({ days: [{ ...day, date: '2026-10-15', pnl: 40, live: true }] });
    closesMock.mockResolvedValue(new Map([['BTC', new Map([['2026-10-14', 100]])]]));
    liveMock.mockReturnValue(new Map([['BTC', 120]]));
    expect((await getDayDetail('2026-10-15', 'EUR', NOW))?.contributions).toEqual([{ asset: 'BTC', pnl: 40 }]);
    dailyMock.mockResolvedValue({ days: [] });
    expect(await getDayDetail('2020-01-01', 'EUR', NOW)).toBeNull();
  });
});
