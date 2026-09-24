import { describe, expect, it, vi, afterEach } from 'vitest';
import { subscanProvider } from './subscanProvider';

describe('subscanProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lee el balance nativo (DOT) del gateway PubFi y aplica los decimales', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        code: 0,
        message: 'Success',
        data: { native: [{ symbol: 'DOT', decimals: 10, balance: '3498618355000' }], assets: [] },
      }),
    }) as unknown as Response));

    const result = await subscanProvider.getBalance('1FRMM8PEiWXYax7rpS6X4XZX1aAAxSWx1CrKTyrVYhV24fg', 'FAKEKEY');
    expect(result).toEqual({ ok: true, balance: 349.8618355 });
  });

  it('devuelve ok:false si no hay API key', async () => {
    const result = await subscanProvider.getBalance('1FRMM8...', undefined);
    expect(result).toEqual({ ok: false, error: 'falta API key para Polkadot Asset Hub (Subscan)' });
  });

  it('devuelve ok:false si el gateway PubFi responde code != 0 (ej. key inválida)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ code: 401, message: 'API key invalid' }),
    }) as unknown as Response));
    const result = await subscanProvider.getBalance('1FRMM8...', 'BADKEY');
    expect(result.ok).toBe(false);
  });

  it('devuelve ok:false si data.native viene vacío (cuenta sin balance nativo indexado)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ code: 0, message: 'Success', data: { native: [], assets: [] } }),
    }) as unknown as Response));
    const result = await subscanProvider.getBalance('1FRMM8...', 'FAKEKEY');
    expect(result.ok).toBe(false);
  });
});
