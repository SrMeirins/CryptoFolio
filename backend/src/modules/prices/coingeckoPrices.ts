import { db } from '../../db/client';
import { BASE_URL, enqueueCoinGeckoCall, fetchWithRetry, notifyStatus } from './coingeckoClient';
import { getCoinGeckoId, searchAndSaveCoinGeckoId } from './coingeckoIds';

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
  const geckoId = getCoinGeckoId(symbol);
  if (!geckoId) {
    console.warn(`[PRICES] Sin coingecko_id para ${symbol}, usando fallback 0`);
    noPricePairs.add(key);
    return 0;
  }

  // 4. Llamar a CoinGecko con rate limiting (cola serial)
  const price = await enqueueCoinGeckoCall(async () => {
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

// ── Precios actuales ──────────────────────────────────────────────────────
// NOTA: esta función no se invoca desde ningún endpoint/ruta en producción
// (verificado por grep) — solo la ejercitan sus propios tests
// (coingeckoPriceCache.test.ts, coingeckoRateLimit.test.ts). El dashboard
// obtiene precios en vivo exclusivamente de binance.ts (WebSocket), que solo
// puebla liveCache para activos con un par de Binance configurado; un activo
// con price_source='coingecko' SIN par de Binance no recibe nunca un precio
// en vivo (getLivePrice() le devuelve null indefinidamente). Esta función es
// la pieza que falta para resolver ese hueco — pendiente de conectarla desde
// loadInitialPrices()/startLivePrices() en el turno de binance.ts (siguiente
// en este nivel), no se hace aquí para no mezclar el fix con el fichero que
// no le corresponde.
export async function getCurrentPricesEur(symbols: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  // EUR siempre = 1
  result.set('EUR', 1);

  // Filtrar los que tienen coingecko_id
  const toFetch = symbols.filter(s => s !== 'EUR' && getCoinGeckoId(s) !== undefined);
  if (toFetch.length === 0) return result;

  const ids = toFetch.map(s => getCoinGeckoId(s)).join(',');
  const url = `${BASE_URL}/simple/price?ids=${ids}&vs_currencies=eur`;

  try {
    // Encolado para no solaparse con otros fetches (respeta el mismo rate limit)
    const data = await enqueueCoinGeckoCall(() => fetchWithRetry(url)) as Record<string, { eur: number }>;

    for (const symbol of toFetch) {
      const geckoId = getCoinGeckoId(symbol)!;
      const price = data[geckoId]?.eur;
      if (price) {
        result.set(symbol, price);
        await db.query(
          `INSERT INTO price_cache (asset, price_eur, source, fetched_at, price_date)
           VALUES ($1, $2, 'coingecko_live', NOW(), CURRENT_DATE)
           ON CONFLICT (asset, price_date) DO UPDATE SET price_eur = EXCLUDED.price_eur, fetched_at = NOW()`,
          [symbol, price]
        );
      }
    }
  } catch (e) {
    console.error('[PRICES] Error obteniendo precios actuales:', e);
  }

  return result;
}

// ── Precarga batch de precios históricos via market_chart/range ───────────
// Para activos CoinGecko con múltiples fechas, una sola llamada range reemplaza
// N llamadas individuales /history?date=, reduciendo el tiempo de 8×6.5s a 6.5s.
export async function prefetchHistoricalPrices(
  requiredPrices: Array<{ symbol: string; date: Date }>
): Promise<void> {
  // Agrupar por símbolo todas las fechas únicas que faltan en caché
  const bySymbol = new Map<string, Set<string>>();
  const dateByKey = new Map<string, Date>();

  for (const { symbol, date } of requiredPrices) {
    if (symbol === 'EUR') continue;
    const dateStr = toDateStr(date);
    const key = `${symbol}|${dateStr}`;
    if (!bySymbol.has(symbol)) bySymbol.set(symbol, new Set());
    bySymbol.get(symbol)!.add(dateStr);
    dateByKey.set(key, date);
  }

  if (bySymbol.size === 0) return;

  // Filtrar las que ya están en caché DB (incluye sentinels)
  for (const [symbol, dateStrs] of bySymbol) {
    const existing = await db.query(
      'SELECT price_date::text FROM price_cache WHERE asset = $1 AND price_date = ANY($2)',
      [symbol, [...dateStrs]]
    );
    for (const row of existing.rows as { price_date: string }[]) {
      dateStrs.delete(row.price_date);
    }
    if (dateStrs.size === 0) bySymbol.delete(symbol);
  }

  if (bySymbol.size === 0) return;

  // Para cada símbolo CoinGecko: una llamada range en lugar de N llamadas /history
  for (const [symbol, dateStrs] of bySymbol) {
    const geckoId = getCoinGeckoId(symbol);
    if (!geckoId) {
      // Sin coingecko_id: fallback a llamadas individuales (la cache DB guardará el resultado)
      for (const dateStr of dateStrs) {
        await getHistoricalPriceEur(symbol, dateByKey.get(`${symbol}|${dateStr}`)!);
      }
      continue;
    }

    const dates = [...dateStrs].map(d => new Date(d + 'T00:00:00Z'));
    const minTs = Math.min(...dates.map(d => d.getTime()));
    const maxTs = Math.max(...dates.map(d => d.getTime()));

    // Buffer de ±1 día para asegurar que los extremos quedan dentro del rango
    const fromTs = Math.floor(minTs / 1000) - 86400;
    const toTs   = Math.floor(maxTs / 1000) + 86400;

    const datesNeeded = [...dateStrs];
    notifyStatus(`🔄 ${symbol}: consultando ${datesNeeded.length} fecha${datesNeeded.length > 1 ? 's' : ''} via CoinGecko market_chart/range (1 llamada)...`);

    const data = await enqueueCoinGeckoCall(async () => {
      const url = `${BASE_URL}/coins/${geckoId}/market_chart/range?vs_currency=eur&from=${fromTs}&to=${toTs}`;
      return await fetchWithRetry(url) as { prices: [number, number][] } | null;
    }).catch((e: Error) => {
      notifyStatus(`⚠ ${symbol}: fallo market_chart/range — ${e.message}`);
      console.warn(`[PRICES] market_chart/range ${symbol}: ${e.message}`);
      return null;
    });

    if (!data?.prices?.length) {
      // Si falla el range (p. ej. 401/429/red), fallback a llamadas individuales /history.
      // El .catch evita que un fallo puntual de CoinGecko aborte toda la fase de precios
      // del import: se degrada con elegancia (fecha sin resolver, sin envenenar la caché)
      // y se reintentará en la siguiente sesión.
      notifyStatus(`↩ ${symbol}: fallback a llamadas individuales /history (${datesNeeded.length} peticiones)`);
      for (const dateStr of dateStrs) {
        await getHistoricalPriceEur(symbol, dateByKey.get(`${symbol}|${dateStr}`)!).catch(() => 0);
      }
      continue;
    }

    // Construir mapa fecha → precio (tomar el último punto de cada día)
    const priceMap = new Map<string, number>();
    for (const [ts, price] of data.prices) {
      if (price > 0) priceMap.set(toDateStr(new Date(ts)), price);
    }

    // Persistir los precios obtenidos del rango. Las fechas NO cubiertas por el rango
    // NO se marcan como no_data: el market_chart/range puede no devolver un punto para
    // una fecha concreta (granularidad diaria) o directamente omitir fechas antiguas por
    // el límite histórico del plan gratuito (ej: LUNC en 2022). Etiquetarlas como -1 aquí
    // envenenaría la caché para siempre. Caen al snapshot individual /history?date=, que
    // sí resuelve fechas antiguas y solo persiste el sentinel -1 si confirma ausencia real.
    let found = 0;
    const missingDates: string[] = [];
    for (const dateStr of datesNeeded) {
      const price = priceMap.get(dateStr);
      if (price && price > 0) {
        await db.query(
          `INSERT INTO price_cache (asset, price_eur, price_date, source)
           VALUES ($1, $2, $3, 'coingecko_chart')
           ON CONFLICT (asset, price_date) DO UPDATE SET price_eur = EXCLUDED.price_eur`,
          [symbol, price, dateStr]
        );
        noPricePairs.delete(`${symbol}|${dateStr}`);
        found++;
        notifyStatus(`✓ ${symbol} @ ${dateStr} = ${price.toFixed(8)} EUR`);
      } else {
        missingDates.push(dateStr);
      }
    }
    for (const dateStr of missingDates) {
      notifyStatus(`↩ ${symbol} @ ${dateStr}: fuera del rango, probando snapshot /history...`);
      await getHistoricalPriceEur(symbol, dateByKey.get(`${symbol}|${dateStr}`)!).catch(() => 0);
    }
    notifyStatus(`✓ ${symbol}: ${found}/${datesNeeded.length} precios obtenidos en 1 llamada API`);
  }
}

// ── Market chart bulk fetch ────────────────────────────────────────────────
export async function fetchMarketChart(
  symbol: string,
  days: number
): Promise<Map<string, number>> {
  let geckoId = getCoinGeckoId(symbol);

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

  const data = await enqueueCoinGeckoCall(async () => {
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
