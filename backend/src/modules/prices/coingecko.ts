import { db } from '../../db/client';

const BASE_URL = process.env.COINGECKO_BASE_URL || 'https://api.coingecko.com/api/v3';
const API_KEY = process.env.COINGECKO_API_KEY || '';

// Mapa symbol → coingecko_id (se carga desde DB al iniciar)
let coinGeckoIds: Map<string, string> = new Map();

export async function loadAssetMetadata(): Promise<void> {
  const res = await db.query(
    'SELECT symbol, coingecko_id FROM asset_metadata WHERE coingecko_id IS NOT NULL'
  );
  coinGeckoIds = new Map(res.rows.map((r: { symbol: string; coingecko_id: string }) => [r.symbol, r.coingecko_id]));
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

// Callback opcional para surfacear eventos de precios (rate limiting, etc.) al caller.
let _statusCallback: ((msg: string) => void) | undefined;
export function setCoinGeckoStatusCallback(cb: ((msg: string) => void) | undefined): void {
  _statusCallback = cb;
}

// ── Rate limiter simple ────────────────────────────────────────────────────
// CoinGecko free: 10-30 req/min. Usamos 6s entre llamadas = 10/min máximo.
class RateLimitedQueue {
  private queue: Array<() => Promise<unknown>> = [];
  private running = false;
  private readonly delayMs: number;

  constructor(delayMs = 6000) {
    this.delayMs = delayMs;
  }

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        }
      });
      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.queue.length > 0) {
      const fn = this.queue.shift()!;
      await fn();
      if (this.queue.length > 0) {
        await sleep(this.delayMs);
      }
    }
    this.running = false;
  }
}

const queue = new RateLimitedQueue(6500); // 6.5s entre llamadas, margen de seguridad

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Fetch con retry ────────────────────────────────────────────────────────
async function fetchWithRetry(url: string, retries = 3): Promise<unknown> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (API_KEY) {
    headers['x-cg-pro-api-key'] = API_KEY;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers });

      if (res.status === 429) {
        // Respetar Retry-After si CoinGecko lo envía, si no usar backoff progresivo
        const retryAfter = parseInt(res.headers.get('retry-after') ?? '0', 10);
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : attempt * 15000;
        const waitSec = Math.round(waitMs / 1000);
        console.warn(`[PRICES] Rate limit (429), esperando ${waitSec}s...`);
        _statusCallback?.(`⚠ Rate limit CoinGecko 429 — esperando ${waitSec}s (intento ${attempt}/${retries})...`);
        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} para ${url}`);
      }

      return await res.json();
    } catch (e) {
      if (attempt === retries) throw e;
      await sleep(3000 * attempt);
    }
  }
  throw new Error(`fetchWithRetry agotó reintentos para ${url}`);
}

// ── Deduplicación de requests in-flight ──────────────────────────────────
// Evita que N llamadas concurrentes para el mismo par (symbol, date) generen
// N requests a CoinGecko. Todas comparten la misma Promise.
const inFlightPrices = new Map<string, Promise<number>>();

// Cache en memoria de pares sin precio (symbol|date).
// Más granular que el antiguo noPriceSymbols (solo por símbolo):
// si ETHFI no tiene precio el 15-Mar-24 pero sí el 1-Apr-24, este cache lo maneja correctamente.
const noPricePairs = new Set<string>();

// ── Precio histórico por fecha ─────────────────────────────────────────────
export async function getHistoricalPriceEur(
  symbol: string,
  date: Date
): Promise<number> {
  const dateStr = toDateStr(date);
  const key = `${symbol}|${dateStr}`;

  // Deduplicar: si ya hay una Promise en vuelo para este par, devolverla directamente.
  // Esto evita que 10 requests concurrentes para ETHFI @ 2024-03-15 generen 10 queries a CoinGecko.
  const existing = inFlightPrices.get(key);
  if (existing) return existing;

  const promise = _getHistoricalPriceEur(symbol, date, dateStr, key).finally(() => {
    inFlightPrices.delete(key);
  });
  inFlightPrices.set(key, promise);
  return promise;
}

async function _getHistoricalPriceEur(
  symbol: string,
  date: Date,
  dateStr: string,
  key: string
): Promise<number> {
  // Cache en memoria: par ya conocido sin precio en esta sesión
  if (noPricePairs.has(key)) return 0;

  // 1. Buscar en caché DB (incluye sentinel -1 = sin precio disponible)
  const cached = await db.query(
    'SELECT price_eur FROM price_cache WHERE asset = $1 AND price_date = $2',
    [symbol, dateStr]
  );
  if (cached.rows.length > 0) {
    const price = parseFloat(cached.rows[0].price_eur);
    if (price < 0) {
      noPricePairs.add(key); // también en memoria para evitar la query DB
      return 0;
    }
    return price;
  }

  // 2. EUR siempre = 1
  if (symbol === 'EUR') return 1;

  // 3. Buscar coingecko_id
  const geckoId = coinGeckoIds.get(symbol);
  if (!geckoId) {
    console.warn(`[PRICES] Sin coingecko_id para ${symbol}, usando fallback 0`);
    noPricePairs.add(key);
    return 0;
  }

  // 4. Llamar a CoinGecko con rate limiting (cola serial)
  const price = await queue.enqueue(async () => {
    // Formato fecha CoinGecko: DD-MM-YYYY
    const geckoDate = formatGeckoDate(date);
    const url = `${BASE_URL}/coins/${geckoId}/history?date=${geckoDate}&localization=false`;

    const data = await fetchWithRetry(url) as {
      market_data?: { current_price?: { eur?: number } }
    };

    const p = data?.market_data?.current_price?.eur;
    if (!p) {
      console.warn(`[PRICES] Sin precio EUR para ${symbol} @ ${dateStr}`);
      noPricePairs.add(key);
      // Persistir sentinela en DB: evita re-consultar en próximas sesiones
      await db.query(
        `INSERT INTO price_cache (asset, price_eur, price_date, source)
         VALUES ($1, -1, $2, 'no_data')
         ON CONFLICT (asset, price_date) DO NOTHING`,
        [symbol, dateStr]
      );
      return 0;
    }
    return p;
  });

  if (!price) return 0;

  // 5. Guardar en caché solo si tenemos precio real
  await db.query(
    `INSERT INTO price_cache (asset, price_eur, price_date, source)
     VALUES ($1, $2, $3, 'coingecko')
     ON CONFLICT (asset, price_date) DO UPDATE SET price_eur = EXCLUDED.price_eur`,
    [symbol, price, dateStr]
  );

  return price;
}

// ── Precios actuales (para dashboard) ────────────────────────────────────
export async function getCurrentPricesEur(symbols: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  // EUR siempre = 1
  result.set('EUR', 1);

  // Filtrar los que tienen coingecko_id
  const toFetch = symbols.filter(s => s !== 'EUR' && coinGeckoIds.has(s));
  if (toFetch.length === 0) return result;

  const ids = toFetch.map(s => coinGeckoIds.get(s)).join(',');
  const url = `${BASE_URL}/simple/price?ids=${ids}&vs_currencies=eur`;

  try {
    // Encolado para no solaparse con otros fetches (respeta el mismo rate limit)
    const data = await queue.enqueue(() => fetchWithRetry(url)) as Record<string, { eur: number }>;

    for (const symbol of toFetch) {
      const geckoId = coinGeckoIds.get(symbol)!;
      const price = data[geckoId]?.eur;
      if (price) {
        result.set(symbol, price);
        await db.query(
          `INSERT INTO price_cache (asset, price_eur, source, fetched_at)
           VALUES ($1, $2, 'coingecko_live', NOW())
           ON CONFLICT (asset, price_date) DO NOTHING`,
          [symbol, price]
        );
      }
    }
  } catch (e) {
    console.error('[PRICES] Error obteniendo precios actuales:', e);
  }

  return result;
}

// ── Precarga batch de precios históricos ──────────────────────────────────
export async function prefetchHistoricalPrices(
  requiredPrices: Array<{ symbol: string; date: Date }>
): Promise<void> {
  const unique = new Map<string, Date>();
  for (const { symbol, date } of requiredPrices) {
    if (symbol === 'EUR') continue;
    const key = `${symbol}|${toDateStr(date)}`;
    if (!unique.has(key)) unique.set(key, date);
  }

  const toFetch: Array<{ symbol: string; date: Date }> = [];
  for (const [key, date] of unique) {
    const symbol = key.split('|')[0];
    const cached = await db.query(
      'SELECT id FROM price_cache WHERE asset = $1 AND price_date = $2',
      [symbol, toDateStr(date)]
    );
    if (cached.rows.length === 0) {
      toFetch.push({ symbol, date });
    }
  }

  if (toFetch.length === 0) return;

  for (const { symbol, date } of toFetch) {
    await getHistoricalPriceEur(symbol, date);
  }
}

// ── Auto-detección de coingecko_id ────────────────────────────────────────
// Activos cuya búsqueda ya falló — evita reintentos infinitos en la misma sesión
const failedSearches = new Set<string>();

// In-flight dedup para búsquedas de ID: evita N búsquedas paralelas para el mismo símbolo
const inFlightSearches = new Map<string, Promise<string | null>>();

export async function searchAndSaveCoinGeckoId(symbol: string): Promise<string | null> {
  if (failedSearches.has(symbol)) return null;
  if (coinGeckoIds.has(symbol)) return coinGeckoIds.get(symbol)!;

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
    const data = await queue.enqueue(async () => {
      return await fetchWithRetry(url) as {
        coins: { id: string; name: string; symbol: string; market_cap_rank: number | null }[]
      };
    });

    const matches = data.coins.filter(c => c.symbol.toUpperCase() === symbol.toUpperCase());
    if (matches.length === 0) {
      console.warn(`[PRICES] Sin coincidencia en CoinGecko para ${symbol}`);
      failedSearches.add(symbol);
      return null;
    }

    matches.sort((a, b) => {
      if (a.market_cap_rank === null) return 1;
      if (b.market_cap_rank === null) return -1;
      return a.market_cap_rank - b.market_cap_rank;
    });

    const geckoId = matches[0].id;

    await db.query(
      'UPDATE asset_metadata SET coingecko_id = $1 WHERE symbol = $2',
      [geckoId, symbol]
    );
    coinGeckoIds.set(symbol, geckoId);

    return geckoId;
  } catch (e) {
    console.error(`[PRICES] Error buscando coingecko_id para ${symbol}:`, (e as Error).message);
    failedSearches.add(symbol);
    return null;
  }
}

// ── Market chart bulk fetch ────────────────────────────────────────────────
export async function fetchMarketChart(
  symbol: string,
  days: number
): Promise<Map<string, number>> {
  let geckoId = coinGeckoIds.get(symbol);

  if (!geckoId) {
    const found = await searchAndSaveCoinGeckoId(symbol);
    if (!found) return new Map();
    geckoId = found;
  }

  const result = new Map<string, number>();

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startStr = toDateStr(startDate);

  const cached = await db.query(
    `SELECT price_date::text AS d, price_eur
     FROM price_cache
     WHERE asset = $1 AND price_date >= $2 AND price_eur > 0
     ORDER BY price_date`,
    [symbol, startStr]
  );
  for (const row of cached.rows) {
    result.set(row.d, parseFloat(row.price_eur));
  }

  const expectedDays = Math.min(days, 365);
  if (result.size >= expectedDays * 0.8) {
    return result;
  }

  const data = await queue.enqueue(async () => {
    const url = `${BASE_URL}/coins/${geckoId}/market_chart?vs_currency=eur&days=${days}`;
    return await fetchWithRetry(url) as { prices: [number, number][] };
  }).catch(e => {
    console.warn(`[PRICES] Market chart ${symbol} falló: ${e.message}`);
    return null;
  });

  if (!data?.prices) return result;

  for (const [ts, price] of data.prices) {
    const date = new Date(ts);
    const dateStr = toDateStr(date);
    result.set(dateStr, price);
    await db.query(
      `INSERT INTO price_cache (asset, price_eur, price_date, source)
       VALUES ($1, $2, $3, 'coingecko_chart')
       ON CONFLICT (asset, price_date) DO UPDATE SET price_eur = EXCLUDED.price_eur`,
      [symbol, price, dateStr]
    );
  }

  return result;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatGeckoDate(date: Date): string {
  const d = date.getUTCDate().toString().padStart(2, '0');
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const y = date.getUTCFullYear();
  return `${d}-${m}-${y}`;
}
