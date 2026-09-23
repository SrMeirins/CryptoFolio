import { describe, expect, it, vi, afterEach } from 'vitest';
import { xrplProvider } from './xrplProvider';

describe('xrplProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('convierte drops a XRP en una respuesta válida', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: { status: 'success', account_data: { Balance: '2963538297' } },
      }),
    }) as unknown as Response));

    const result = await xrplProvider.getBalance('rN7n34b4RM8FAFGbFZapWrdMJB1qVHbXLe', undefined);
    expect(result).toEqual({ ok: true, balance: 2963.538297 });
  });

  it('devuelve ok:false si la cuenta no existe (actNotFound)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ result: { status: 'error', error: 'actNotFound' } }),
    }) as unknown as Response));

    const result = await xrplProvider.getBalance('rInexistente', undefined);
    expect(result.ok).toBe(false);
  });

  it('devuelve ok:false si la petición lanza (timeout/red)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network error'); }));
    const result = await xrplProvider.getBalance('rN7n34b4RM8FAFGbFZapWrdMJB1qVHbXLe', undefined);
    expect(result.ok).toBe(false);
  });
});
