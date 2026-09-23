import { describe, expect, it, vi, afterEach } from 'vitest';
import { subscanProvider } from './subscanProvider';

describe('subscanProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lee el balance en DOT ya formateado por Subscan', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ code: 0, data: { account: { balance: '87.5000000000' } } }),
    }) as unknown as Response));

    const result = await subscanProvider.getBalance('1FRMM8PEiWXYax7rpS6X4XZX1aAAxSWx1CrKTyrVYhV24fg', 'FAKEKEY');
    expect(result).toEqual({ ok: true, balance: 87.5 });
  });

  it('devuelve ok:false si no hay API key', async () => {
    const result = await subscanProvider.getBalance('1FRMM8...', undefined);
    expect(result).toEqual({ ok: false, error: 'falta API key para Polkadot Asset Hub (Subscan)' });
  });

  it('devuelve ok:false si Subscan responde code != 0', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ code: 10004, message: 'Invalid API Key' }),
    }) as unknown as Response));
    const result = await subscanProvider.getBalance('1FRMM8...', 'BADKEY');
    expect(result.ok).toBe(false);
  });
});
