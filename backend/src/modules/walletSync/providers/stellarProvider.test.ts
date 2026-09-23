import { describe, expect, it, vi, afterEach } from 'vitest';
import { stellarProvider } from './stellarProvider';

describe('stellarProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('extrae el balance nativo (XLM) del array de balances', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        balances: [
          { asset_type: 'credit_alphanum4', asset_code: 'USDC', balance: '10.0000000' },
          { asset_type: 'native', balance: '542.1234567' },
        ],
      }),
    }) as unknown as Response));

    const result = await stellarProvider.getBalance('GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV5UOIQJOHNHKN', undefined);
    expect(result).toEqual({ ok: true, balance: 542.1234567 });
  });

  it('devuelve ok:false si la cuenta no existe (404)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as unknown as Response));
    const result = await stellarProvider.getBalance('GINEXISTENTE', undefined);
    expect(result.ok).toBe(false);
  });
});
