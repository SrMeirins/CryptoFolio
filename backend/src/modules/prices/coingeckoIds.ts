import { db } from '../../db/client';
import { BASE_URL, enqueueCoinGeckoCall, fetchWithRetry } from './coingeckoClient';

// Mapa symbol → coingecko_id (se carga desde DB al iniciar)
let coinGeckoIds: Map<string, string> = new Map();

export async function loadAssetMetadata(): Promise<void> {
  const res = await db.query(
    'SELECT symbol, coingecko_id FROM asset_metadata WHERE coingecko_id IS NOT NULL'
  );
  coinGeckoIds = new Map(res.rows.map((r: { symbol: string; coingecko_id: string }) => [r.symbol, r.coingecko_id]));
}

export function getCoinGeckoId(symbol: string): string | undefined {
  return coinGeckoIds.get(symbol);
}

export function hasCoinGeckoId(symbol: string): boolean {
  return coinGeckoIds.has(symbol);
}

// Detecta activos configurados como CoinGecko pero sin coingecko_id en DB
// (datos corruptos por el bug en upsertAssetMetadata que insertaba NULL).
// Se llama al arrancar el servidor — corrige en background via la cola con rate limit.
export async function repairMissingCoinGeckoIds(): Promise<void> {
  const res = await db.query(
    "SELECT symbol FROM asset_metadata WHERE price_source = 'coingecko' AND coingecko_id IS NULL"
  );
  if (res.rows.length === 0) return;
  console.log(`[PRICES] Reparando ${res.rows.length} activo(s) sin coingecko_id: ${res.rows.map((r: { symbol: string }) => r.symbol).join(', ')}`);
  for (const { symbol } of res.rows as { symbol: string }[]) {
    await searchAndSaveCoinGeckoId(symbol); // cola con rate limit, no inunda CoinGecko
  }
  console.log('[PRICES] coingecko_id reparados.');
}

// ── Auto-detección de coingecko_id ────────────────────────────────────────
// Busca en CoinGecko el mejor candidato para un símbolo sin guardar nada en DB.
// Devuelve { id, price_eur } del primer candidato que tenga precio activo, o null.
export async function searchCoinGeckoBySymbol(
  symbol: string
): Promise<{ id: string; price_eur: number } | null> {
  const url = `${BASE_URL}/search?query=${encodeURIComponent(symbol)}`;
  try {
    const data = await enqueueCoinGeckoCall(() => fetchWithRetry(url)) as {
      coins: { id: string; symbol: string; market_cap_rank: number | null }[]
    };
    const candidates = data.coins
      .filter(c => c.symbol.toUpperCase() === symbol.toUpperCase())
      .sort((a, b) => {
        if (a.market_cap_rank === null) return 1;
        if (b.market_cap_rank === null) return -1;
        return a.market_cap_rank - b.market_cap_rank;
      })
      .slice(0, 5)
      .map(c => c.id);

    if (candidates.length === 0) return null;

    const ids = candidates.join(',');
    const prices = await fetchWithRetry(
      `${BASE_URL}/simple/price?ids=${ids}&vs_currencies=eur`
    ) as Record<string, { eur: number }>;

    for (const id of candidates) {
      const price = prices[id]?.eur;
      if (price != null && price > 0) return { id, price_eur: price };
    }
    return null;
  } catch {
    return null;
  }
}

// Activos cuya búsqueda ya falló — evita reintentos infinitos en la misma sesión
const failedSearches = new Set<string>();

// In-flight dedup para búsquedas de ID: evita N búsquedas paralelas para el mismo símbolo
const inFlightSearches = new Map<string, Promise<string | null>>();

export async function searchAndSaveCoinGeckoId(symbol: string): Promise<string | null> {
  if (failedSearches.has(symbol)) return null;
  if (hasCoinGeckoId(symbol)) return getCoinGeckoId(symbol)!;

  // Deduplicar búsquedas concurrentes del mismo símbolo
  const existing = inFlightSearches.get(symbol);
  if (existing) return existing;

  const promise = _searchAndSaveCoinGeckoId(symbol).finally(() => {
    inFlightSearches.delete(symbol);
  });
  inFlightSearches.set(symbol, promise);
  return promise;
}

async function _searchAndSaveCoinGeckoId(symbol: string): Promise<string | null> {
  const url = `${BASE_URL}/search?query=${encodeURIComponent(symbol)}`;

  try {
    const data = await enqueueCoinGeckoCall(async () => {
      return await fetchWithRetry(url) as {
        coins: { id: string; name: string; symbol: string; market_cap_rank: number | null }[]
      };
    });

    const matches = data.coins
      .filter(c => c.symbol.toUpperCase() === symbol.toUpperCase())
      .sort((a, b) => {
        if (a.market_cap_rank === null) return 1;
        if (b.market_cap_rank === null) return -1;
        return a.market_cap_rank - b.market_cap_rank;
      });

    if (matches.length === 0) {
      console.warn(`[PRICES] Sin coincidencia en CoinGecko para ${symbol}`);
      failedSearches.add(symbol);
      return null;
    }

    // Verificar cuál candidato devuelve precio activo con una sola llamada batch.
    // Esto evita guardar un ID incorrecto (p.ej. tokens IOU pre-lanzamiento sin mercado activo).
    const candidates = matches.slice(0, 5).map(c => c.id);
    const geckoId = await verifyBestCandidateId(candidates) ?? candidates[0];

    await saveCoinGeckoId(symbol, geckoId);
    return geckoId;
  } catch (e) {
    console.error(`[PRICES] Error buscando coingecko_id para ${symbol}:`, (e as Error).message);
    failedSearches.add(symbol);
    return null;
  }
}

// Llama a simple/price con todos los candidatos a la vez y devuelve el primero con precio real.
// Usa un fetch directo (sin la cola) para no bloquear otras operaciones en curso.
async function verifyBestCandidateId(candidates: string[]): Promise<string | null> {
  try {
    const ids = candidates.join(',');
    const data = await fetchWithRetry(
      `${BASE_URL}/simple/price?ids=${ids}&vs_currencies=eur`
    ) as Record<string, { eur: number }>;

    for (const id of candidates) {
      if (data[id]?.eur != null && data[id].eur > 0) return id;
    }
  } catch { /* si falla la verificación, el caller usa candidates[0] */ }
  return null;
}

async function saveCoinGeckoId(symbol: string, geckoId: string): Promise<void> {
  await db.query(
    'UPDATE asset_metadata SET coingecko_id = $1 WHERE symbol = $2',
    [geckoId, symbol]
  );
  coinGeckoIds.set(symbol, geckoId);
}

// Actualiza el coingecko_id manualmente (desde la UI de Settings).
// Recarga el map en memoria inmediatamente para que el siguiente fetch lo use.
export async function updateCoinGeckoId(symbol: string, geckoId: string): Promise<void> {
  await saveCoinGeckoId(symbol, geckoId);
  // Limpiar el map de fallidos para permitir reintentos si el usuario corrige el ID
  failedSearches.delete(symbol);
}

// Verifica si un coingecko_id concreto devuelve precio activo.
// Usado por el endpoint de test en Settings antes de guardar.
export async function verifyCoinGeckoId(geckoId: string): Promise<number | null> {
  try {
    const data = await fetchWithRetry(
      `${BASE_URL}/simple/price?ids=${encodeURIComponent(geckoId)}&vs_currencies=eur`
    ) as Record<string, { eur: number }>;
    const price = data[geckoId]?.eur;
    return price != null && price > 0 ? price : null;
  } catch {
    return null;
  }
}
