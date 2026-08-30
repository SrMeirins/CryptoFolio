import { describe, expect, it, vi, afterEach } from 'vitest';
import { etherscanProvider } from './etherscanProvider';

function mockFetchSequence(responses: unknown[]) {
  let call = 0;
  vi.stubGlobal('fetch', vi.fn(async () => {
    const body = responses[call++];
    return { ok: true, json: async () => body } as unknown as Response;
  }));
}

describe('etherscanProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('balance nativo ETH: convierte wei a ETH', async () => {
    mockFetchSequence([{ status: '1', result: '2500000000000000000' }]); // 2.5 ETH
    const result = await etherscanProvider.getBalance('0x71C7656EC7ab88b098defB751B7401B5f6d8976F', 'FAKEKEY');
    expect(result).toEqual({ ok: true, balance: 2.5 });
  });

  it('balance de token ERC-20 (LINK, 18 decimales): consulta decimals() y convierte', async () => {
    mockFetchSequence([
      { status: '1', result: '10000000000000000000' }, // tokenbalance: 10 LINK en unidad mínima
      { status: '1', result: '0x12' },                  // eth_call decimals(): 18
    ]);
    const result = await etherscanProvider.getBalance(
      '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
      'FAKEKEY',
      '0x514910771AF9Ca656af840dff83E8264EcF986CA'
    );
    expect(result).toEqual({ ok: true, balance: 10 });
  });

  it('balance de token con 6 decimales (ej. USDC) no se confunde con 18', async () => {
    mockFetchSequence([
      { status: '1', result: '5000000' }, // 5 USDC en unidad mínima (6 decimales)
      { status: '1', result: '0x6' },     // eth_call decimals(): 6
    ]);
    const result = await etherscanProvider.getBalance(
      '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
      'FAKEKEY',
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
    );
    expect(result).toEqual({ ok: true, balance: 5 });
  });

  it('devuelve ok:false si Etherscan responde status "0" (ej. rate limit o key inválida)', async () => {
    mockFetchSequence([{ status: '0', message: 'NOTOK', result: 'Invalid API Key' }]);
    const result = await etherscanProvider.getBalance('0x71C7656EC7ab88b098defB751B7401B5f6d8976F', 'BADKEY');
    expect(result.ok).toBe(false);
  });

  it('devuelve ok:false si no hay API key disponible', async () => {
    const result = await etherscanProvider.getBalance('0x71C7656EC7ab88b098defB751B7401B5f6d8976F', undefined);
    expect(result).toEqual({ ok: false, error: 'falta API key para Ethereum (Etherscan)' });
  });
});
