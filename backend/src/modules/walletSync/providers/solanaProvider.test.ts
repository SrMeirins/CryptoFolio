import { describe, expect, it, vi, afterEach } from 'vitest';
import { solanaProvider } from './solanaProvider';

describe('solanaProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('balance nativo SOL: convierte lamports a SOL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ result: { value: 2_500_000_000 } }),
    }) as unknown as Response));

    const result = await solanaProvider.getBalance('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', undefined);
    expect(result).toEqual({ ok: true, balance: 2.5 });
  });

  it('balance de token SPL: usa uiAmount ya con decimales aplicados', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: { value: [{ account: { data: { parsed: { info: { tokenAmount: { uiAmount: 42.5 } } } } } }] },
      }),
    }) as unknown as Response));

    const result = await solanaProvider.getBalance(
      '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', undefined, 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm'
    );
    expect(result).toEqual({ ok: true, balance: 42.5 });
  });

  it('balance de token SPL sin cuentas asociadas devuelve 0', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ result: { value: [] } }) }) as unknown as Response));
    const result = await solanaProvider.getBalance('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', undefined, 'mint-sin-cuenta');
    expect(result).toEqual({ ok: true, balance: 0 });
  });

  it('devuelve ok:false si el RPC devuelve un error JSON-RPC', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ error: { code: -32602, message: 'Invalid params' } }),
    }) as unknown as Response));
    const result = await solanaProvider.getBalance('direccion-invalida', undefined);
    expect(result.ok).toBe(false);
  });
});
