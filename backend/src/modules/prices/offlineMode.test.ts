import { describe, expect, it, vi, afterEach } from 'vitest';
import { parsePriceSourcesOffline, priceSourcesOffline, PriceSourcesOfflineError } from './offlineMode';
import { fetchWithTimeout } from './httpTimeout';

// Modo sin red de los proveedores de precios (#359).
describe('PRICE_SOURCES_OFFLINE', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it('solo admite «true», «false» o vacío; por defecto está desactivado', () => {
    expect(parsePriceSourcesOffline(undefined)).toBe(false);
    expect(parsePriceSourcesOffline('')).toBe(false);
    expect(parsePriceSourcesOffline('false')).toBe(false);
    expect(parsePriceSourcesOffline('true')).toBe(true);
  });

  it('un valor no reconocido es un error de configuración (fallo seguro)', () => {
    for (const v of ['TRUE', '1', 'yes', 'ture']) expect(() => parsePriceSourcesOffline(v), v).toThrow(/PRICE_SOURCES_OFFLINE/);
  });

  it('activo: fetchWithTimeout falla al instante sin llamar a fetch', async () => {
    vi.stubEnv('PRICE_SOURCES_OFFLINE', 'true');
    const spy = vi.spyOn(globalThis, 'fetch');
    expect(priceSourcesOffline()).toBe(true);
    await expect(fetchWithTimeout('https://api.binance.com/api/v3/ping')).rejects.toBeInstanceOf(PriceSourcesOfflineError);
    expect(spy).not.toHaveBeenCalled();
  });

  it('el mensaje solo nombra el host, nunca la URL completa con sus parámetros', () => {
    const err = new PriceSourcesOfflineError('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&x_cg_demo_api_key=secreto');
    expect(err.message).toContain('api.coingecko.com');
    expect(err.message).not.toContain('secreto');
  });

  it('desactivado: fetchWithTimeout sí llama a fetch (aquí simulado)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
    await fetchWithTimeout('https://api.binance.com/api/v3/ping');
    expect(spy).toHaveBeenCalledOnce();
  });
});
