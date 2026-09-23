import { describe, expect, it, vi, afterEach } from 'vitest';
import { hederaProvider } from './hederaProvider';

describe('hederaProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('convierte tinybars a HBAR', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ balance: { balance: 150000000 } }),
    }) as unknown as Response));

    const result = await hederaProvider.getBalance('0.0.1234567', undefined);
    expect(result).toEqual({ ok: true, balance: 1.5 });
  });

  it('devuelve ok:false si la respuesta HTTP no es 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as unknown as Response));
    const result = await hederaProvider.getBalance('0.0.0', undefined);
    expect(result.ok).toBe(false);
  });
});
