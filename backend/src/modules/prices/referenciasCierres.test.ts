import { describe, expect, it, vi, beforeEach } from 'vitest';

// Cierres de las referencias de la evolución (#510). Sin red ni base de datos.
const { cacheMock, prefetchMock } = vi.hoisted(() => ({ cacheMock: vi.fn(), prefetchMock: vi.fn() }));
vi.mock('./closePrices', async (orig) => ({
  ...(await orig<typeof import('./closePrices')>()),
  getCachedCloses: cacheMock,
  prefetchCloseRange: prefetchMock,
}));
const { asegurarCierresReferencia, cierresQueFaltan, esperarReferencias } = await import('./referenciasCierres');

const NOW = Date.UTC(2026, 0, 10, 12);

beforeEach(() => { cacheMock.mockReset(); prefetchMock.mockReset(); });

describe('cierresQueFaltan', () => {
  it('días hasta ayer sin cierre en la caché, por referencia', async () => {
    cacheMock.mockResolvedValue(new Map([
      ['BTC', new Map([['2026-01-07', 1], ['2026-01-08', 1], ['2026-01-09', 1]])],
      ['USDT', new Map([['2026-01-07', 1], ['2026-01-09', 1]])],
    ]));
    const f = await cierresQueFaltan('2026-01-07', 'Europe/Madrid', NOW);
    expect(f.get('BTC')).toBeUndefined();
    expect(f.get('ETH')).toEqual(['2026-01-07', '2026-01-08', '2026-01-09']);
    expect(f.get('USDT')).toEqual(['2026-01-08']);
  });
});

describe('asegurarCierresReferencia', () => {
  it('descarga en segundo plano el rango que falta de cada referencia, una vez', async () => {
    cacheMock.mockResolvedValue(new Map([['BTC', new Map()], ['ETH', new Map()], ['USDT', new Map()]]));
    prefetchMock.mockResolvedValue(undefined);
    asegurarCierresReferencia('2026-01-07', 'Europe/Madrid');
    asegurarCierresReferencia('2026-01-07', 'Europe/Madrid'); // en curso: no repite
    await esperarReferencias();
    expect(prefetchMock.mock.calls.map(c => c[0]).sort()).toEqual(['BTC', 'ETH', 'USDT']);
  });
  it('un fallo de descarga no rompe nada', async () => {
    cacheMock.mockResolvedValue(new Map());
    prefetchMock.mockRejectedValue(new Error('sin red'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    asegurarCierresReferencia('2026-01-07', 'Europe/Madrid');
    await esperarReferencias();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
