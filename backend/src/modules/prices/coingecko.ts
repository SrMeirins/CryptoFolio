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
  console.log(`[PRICES] ${coinGeckoIds.size} activos cargados desde asset_metadata`);
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
        const waitMs = attempt * 15000; // 15s, 30s, 45s
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

    console.log(`[PRICES] Fetching ${symbol} @ ${dateStr} (${geckoId})`);
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
    const data = await fetchWithRetry(url) as Record<string, { eur: number }>;

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

  if (toFetch.length === 0) {
    console.log('[PRICES] Todos los precios históricos ya están en caché ✓');
    return;
  }

  console.log(`[PRICES] Precargando ${toFetch.length} precios históricos...`);
  console.log(`[PRICES] Tiempo estimado: ~${Math.ceil(toFetch.length * 6.5 / 60)} minutos`);

  for (const { symbol, date } of toFetch) {
    await getHistoricalPriceEur(symbol, date);
  }

  console.log('[PRICES] Precarga de precios históricos completada ✓');
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
