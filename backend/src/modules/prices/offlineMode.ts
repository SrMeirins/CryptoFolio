// Modo sin red de los proveedores de precios (#359). Con
// PRICE_SOURCES_OFFLINE=true el backend no sale a internet a por precios
// (Binance, CoinGecko, OKX, CoinPaprika ni el feed en vivo): solo usa lo que
// ya hay en caché, y lo que no está queda sin precio — nunca uno inventado.
// Pensado para la CI y los tests; por defecto está desactivado.

export class PriceSourcesOfflineError extends Error {
  constructor(url: string) {
    super(`Precios externos desactivados (PRICE_SOURCES_OFFLINE): no se consulta ${safeHost(url)}`);
    this.name = 'PriceSourcesOfflineError';
  }
}

function safeHost(url: string): string {
  try { return new URL(url).host; } catch { return 'el proveedor'; }
}

/**
 * Valor de PRICE_SOURCES_OFFLINE: «true», «false» o sin definir (false).
 * Cualquier otro valor es un error de configuración: mejor no arrancar que
 * activar o desactivar la red por un error tipográfico (fallo seguro).
 */
export function parsePriceSourcesOffline(raw: string | undefined): boolean {
  if (raw === undefined || raw === '') return false;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`PRICE_SOURCES_OFFLINE debe ser «true» o «false» (recibido: «${raw.slice(0, 20)}»)`);
}

/** ¿Están desactivados los precios externos? Se lee en cada llamada (los tests lo cambian con vi.stubEnv). */
export function priceSourcesOffline(): boolean {
  return parsePriceSourcesOffline(process.env.PRICE_SOURCES_OFFLINE);
}
