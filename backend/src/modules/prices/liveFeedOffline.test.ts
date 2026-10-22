import { describe, expect, it, vi, afterAll } from 'vitest';

// Feed en vivo en modo sin red (#359): ni WebSocket de Binance ni refrescos
// periódicos. db/client y ws se simulan: el test no toca la BD ni la red.
const wsCtor = vi.fn();
vi.mock('ws', () => ({ WebSocket: wsCtor }));
vi.mock('../../db/client', () => ({ db: { query: vi.fn(async () => ({ rows: [] })) }, pool: {} }));

describe('startLivePrices con PRICE_SOURCES_OFFLINE', () => {
  afterAll(() => { vi.unstubAllEnvs(); });

  it('no abre el WebSocket ni programa refrescos', async () => {
    vi.stubEnv('PRICE_SOURCES_OFFLINE', 'true');
    const interval = vi.spyOn(globalThis, 'setInterval');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { startLivePrices } = await import('./liveFeed');
    startLivePrices();
    await new Promise(r => setTimeout(r, 20));
    expect(wsCtor).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
