import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

// Fuentes de logo de un activo (#449): id de CoinGecko solo para el logo y el
// paquete local incluido en la app. Funciones puras salvo la lectura del fichero.

/** Id de CoinGecko con forma válida (minúsculas, números y guiones). */
export function isValidCoinGeckoId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,99}$/.test(id);
}

/** Símbolo apto para nombrar un fichero del paquete local: nunca una ruta. */
export function isIconSymbol(symbol: string): boolean {
  return /^[A-Z0-9]{1,20}$/.test(symbol);
}

/**
 * Mejor candidato de una búsqueda de CoinGecko para un símbolo: mismo símbolo
 * exacto y mayor capitalización (menor market_cap_rank); los que no tienen
 * rango van al final. null si no hay ninguno con forma válida.
 */
export function bestCoinGeckoMatch(coins: unknown, symbol: string): string | null {
  if (!Array.isArray(coins)) return null;
  const wanted = symbol.toUpperCase();
  const candidates = coins
    .filter((c): c is { id: string; symbol: string; market_cap_rank?: number | null } =>
      !!c && typeof c === 'object' && isValidCoinGeckoId((c as { id?: unknown }).id)
      && typeof (c as { symbol?: unknown }).symbol === 'string' && (c as { symbol: string }).symbol.toUpperCase() === wanted)
    .sort((a, b) => (a.market_cap_rank ?? Infinity) - (b.market_cap_rank ?? Infinity));
  return candidates[0]?.id ?? null;
}

// En desarrollo (src/modules/assets) y compilado (dist/modules/assets) el
// paquete queda dos niveles por encima: src/assets o dist/assets.
export const LOCAL_ICONS_DIR = path.resolve(__dirname, '..', '..', 'assets', 'crypto-icons');

/** PNG del paquete local para el símbolo, o null. Comprueba que no sale de la carpeta. */
export function localIcon(symbol: string, dir: string = LOCAL_ICONS_DIR): Buffer | null {
  if (!isIconSymbol(symbol) || !existsSync(dir)) return null;
  const file = path.join(dir, `${symbol.toLowerCase()}.png`);
  if (!existsSync(file)) return null;
  const real = realpathSync(file);
  if (!real.startsWith(realpathSync(dir) + path.sep)) return null;
  return readFileSync(real);
}
