import { describe, expect, it, vi, afterEach } from 'vitest';
import { blockfrostProvider } from './blockfrostProvider';

describe('blockfrostProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('convierte lovelace a ADA', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ amount: [{ unit: 'lovelace', quantity: '325000000' }] }),
    }) as unknown as Response));

    const result = await blockfrostProvider.getBalance('addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer', 'FAKEKEY');
    expect(result).toEqual({ ok: true, balance: 325 });
  });

  it('devuelve ok:false si no hay API key', async () => {
    const result = await blockfrostProvider.getBalance('addr1...', undefined);
    expect(result).toEqual({ ok: false, error: 'falta API key para Cardano (Blockfrost)' });
  });

  it('devuelve ok:false si la dirección no existe (404)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as unknown as Response));
    const result = await blockfrostProvider.getBalance('addr1inexistente', 'FAKEKEY');
    expect(result.ok).toBe(false);
  });
});
