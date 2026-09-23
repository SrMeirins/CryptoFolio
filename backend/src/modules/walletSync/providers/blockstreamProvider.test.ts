import { describe, expect, it, vi, afterEach } from 'vitest';
import { blockstreamProvider } from './blockstreamProvider';

describe('blockstreamProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('calcula el balance confirmado en BTC a partir de funded/spent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        chain_stats: { funded_txo_sum: 150_000_000, spent_txo_sum: 50_000_000 },
      }),
    }) as unknown as Response));

    const result = await blockstreamProvider.getBalance('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', undefined);
    expect(result).toEqual({ ok: true, balance: 1 });
  });

  it('devuelve ok:false si la petición falla', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400, json: async () => ({}) }) as unknown as Response));
    const result = await blockstreamProvider.getBalance('direccion-invalida', undefined);
    expect(result.ok).toBe(false);
  });
});
