import { describe, expect, it, vi, afterEach } from 'vitest';
import { takeBlockedHosts, urlOf } from './blockExternalNetwork';

// Guardia de red de los tests (#359).
describe('blockExternalNetwork', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('rechaza un host externo al instante y lo registra para hacer fallar el test', async () => {
    await expect(fetch('https://api.binance.com/api/v3/ping')).rejects.toThrow('red bloqueada en test: simula api.binance.com');
    expect(takeBlockedHosts()).toEqual(['api.binance.com']);
    expect(takeBlockedHosts()).toEqual([]);   // el registro se vacía al consultarlo
  });

  it('una simulación explícita de fetch no queda bloqueada', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}')));
    await expect((await fetch('https://api.coingecko.com/api/v3/ping')).json()).resolves.toEqual({ ok: true });
    expect(takeBlockedHosts()).toEqual([]);
  });

  it('urlOf admite cadena, URL y Request', () => {
    expect(urlOf('http://localhost:3001/x')).toBe('http://localhost:3001/x');
    expect(urlOf(new URL('https://example.org/a'))).toBe('https://example.org/a');
    expect(urlOf(new Request('https://example.org/b'))).toBe('https://example.org/b');
  });
});
