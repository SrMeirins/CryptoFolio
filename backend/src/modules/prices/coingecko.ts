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
        console.warn(`[PRICES] Rate limit (429), esperando ${waitMs / 1000}s...`);
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

// ── Precio histórico por fecha ─────────────────────────────────────────────
export async function getHistoricalPriceEur(
  symbol: string,
  date: Date
): Promise<number> {
  const dateStr = toDateStr(date); // YYYY-MM-DD

  // 1. Buscar en caché DB
  const cached = await db.query(
    'SELECT price_eur FROM price_cache WHERE asset = $1 AND price_date = $2',
    [symbol, dateStr]
  );
  if (cached.rows.length > 0) {
    return parseFloat(cached.rows[0].price_eur);
  }

  // 2. Stablecoins: USDC/USDT ≈ precio real, no asumimos 1
  // EUR es fiat, siempre = 1
  if (symbol === 'EUR') return 1;

  // 3. Buscar coingecko_id
  const geckoId = coinGeckoIds.get(symbol);
  if (!geckoId) {
    console.warn(`[PRICES] Sin coingecko_id para ${symbol}, usando fallback 0`);
    return 0;
  }

  // 4. Llamar a CoinGecko con rate limiting
  const price = await queue.enqueue(async () => {
    // Formato fecha CoinGecko: DD-MM-YYYY
    const geckoDate = formatGeckoDate(date);
    const url = `${BASE_URL}/coins/${geckoId}/history?date=${geckoDate}&localization=false`;

    const data = await fetchWithRetry(url) as {
      market_data?: { current_price?: { eur?: number } }
    };

    const price = data?.market_data?.current_price?.eur;
    if (!price) {
      console.warn(`[PRICES] Sin precio EUR para ${symbol} @ ${dateStr}, fallback 0`);
      return 0;
    }
    return price;
  });

  // 5. Guardar en caché
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
        // Cachear precio actual (sin price_date = precio live)
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
// Llama a esto ANTES de correr el motor FIFO para cachear todos los precios necesarios
export async function prefetchHistoricalPrices(
  requiredPrices: Array<{ symbol: string; date: Date }>
): Promise<void> {
  // Deduplicar por symbol+date
  const unique = new Map<string, Date>();
  for (const { symbol, date } of requiredPrices) {
    if (symbol === 'EUR') continue;
    const key = `${symbol}|${toDateStr(date)}`;
    if (!unique.has(key)) unique.set(key, date);
  }

  // Filtrar los que ya están en caché
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

export async function searchAndSaveCoinGeckoId(symbol: string): Promise<string | null> {
  if (failedSearches.has(symbol)) return null;
  if (coinGeckoIds.has(symbol)) return coinGeckoIds.get(symbol)!;

  const url = `${BASE_URL}/search?query=${encodeURIComponent(symbol)}`;

  try {
    const data = await queue.enqueue(async () => {
      return await fetchWithRetry(url) as {
        coins: { id: string; name: string; symbol: string; market_cap_rank: number | null }[]
      };
    });

    // Coincidencia exacta de símbolo (case-insensitive)
    const matches = data.coins.filter(c => c.symbol.toUpperCase() === symbol.toUpperCase());
    if (matches.length === 0) {
      console.warn(`[PRICES] Sin coincidencia en CoinGecko para ${symbol}`);
      failedSearches.add(symbol);
      return null;
    }

    // El de menor market_cap_rank es el más establecido (null = sin ranking, al final)
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
// Descarga todos los precios diarios de un activo para N días en UNA request.
// CoinGecko devuelve datos diarios hasta 90 días, semanales para >90 días.
// Almacena cada punto en price_cache para que quede disponible sin re-fetch.
export async function fetchMarketChart(
  symbol: string,
  days: number
): Promise<Map<string, number>> {
  let geckoId = coinGeckoIds.get(symbol);

  // Si no tenemos coingecko_id, intentar auto-detectarlo vía CoinGecko Search
  if (!geckoId) {
    const found = await searchAndSaveCoinGeckoId(symbol);
    if (!found) return new Map();
    geckoId = found;
  }

  const result = new Map<string, number>();

  // Comprobar cuántas fechas del rango ya están en caché
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startStr = toDateStr(startDate);

  const cached = await db.query(
    `SELECT price_date::text AS d, price_eur
     FROM price_cache
     WHERE asset = $1 AND price_date >= $2
     ORDER BY price_date`,
    [symbol, startStr]
  );
  for (const row of cached.rows) {
    result.set(row.d, parseFloat(row.price_eur));
  }

  // Si ya tenemos datos suficientes, no re-fetch (>= 80% de los días esperados)
  const expectedDays = Math.min(days, 365);
  if (result.size >= expectedDays * 0.8) {
    return result;
  }

  // Fetch bulk desde CoinGecko (sin interval=daily — parámetro de plan Pro)
  // CoinGecko auto-selecciona granularidad: hourly ≤90d, daily >90d
  const data = await queue.enqueue(async () => {
    const url = `${BASE_URL}/coins/${geckoId}/market_chart?vs_currency=eur&days=${days}`;
    return await fetchWithRetry(url) as { prices: [number, number][] };
  }).catch(e => {
    console.warn(`[PRICES] Market chart ${symbol} falló: ${e.message}`);
    return null;
  });

  if (!data?.prices) return result; // falló o sin datos — devolvemos lo que había en caché

  // Guardar cada punto en caché
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
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

function formatGeckoDate(date: Date): string {
  const d = date.getUTCDate().toString().padStart(2, '0');
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const y = date.getUTCFullYear();
  return `${d}-${m}-${y}`; // DD-MM-YYYY
}
