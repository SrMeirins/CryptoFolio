import { Router } from 'express';
import { db } from '../../db/client';
import { sendInternalError } from '../../middleware/errorHandler';
import { fetchMarketChart, loadAssetMetadata as loadCoinGeckoMetadata } from '../../modules/prices/coingecko';

const router = Router();

// ── Helper: cómputo de puntos desde price_cache (sin red) ────────────────────
async function computeHistoryFromCache(
  days: number,
  lots: { asset: string; qty: number; opened_at: Date }[],
  consumptions: { asset: string; qty: number; consumed_at: Date }[],
): Promise<{ points: { date: string; value: number }[]; refreshing: boolean }> {
  const endDate   = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startStr  = startDate.toISOString().slice(0, 10);

  // Cargar todos los precios del rango desde caché en una sola query
  const allAssets = [...new Set(lots.map(l => l.asset))].filter(a => a !== 'EUR');
  const cacheRes  = await db.query(
    `SELECT asset, price_date::text AS d, price_eur::float AS price
     FROM price_cache
     WHERE asset = ANY($1) AND price_date >= $2
     ORDER BY asset, price_date`,
    [allAssets, startStr]
  );

  const pricesByAsset = new Map<string, Map<string, number>>();
  for (const row of cacheRes.rows as { asset: string; d: string; price: number }[]) {
    if (!pricesByAsset.has(row.asset)) pricesByAsset.set(row.asset, new Map());
    pricesByAsset.get(row.asset)!.set(row.d, row.price);
  }

  // ¿Necesita refresh? Solo activos con coingecko_id Y con holdings reales durante el periodo
  const geckoRes   = await db.query('SELECT symbol FROM asset_metadata WHERE coingecko_id IS NOT NULL');
  const fetchable  = new Set<string>(geckoRes.rows.map((r: { symbol: string }) => r.symbol));

  // Calcular qué activos tenían holdings > 0 en algún punto del periodo
  const openedBeforeEnd = new Map<string, number>();
  for (const lot of lots) {
    if (lot.asset === 'EUR' || lot.opened_at > endDate) continue;
    openedBeforeEnd.set(lot.asset, (openedBeforeEnd.get(lot.asset) ?? 0) + lot.qty);
  }
  const consumedBeforeStart = new Map<string, number>();
  for (const c of consumptions) {
    if (c.consumed_at < startDate) {
      consumedBeforeStart.set(c.asset, (consumedBeforeStart.get(c.asset) ?? 0) + c.qty);
    }
  }
  const activeInPeriod = new Set<string>();
  for (const [asset, openedQty] of openedBeforeEnd) {
    if (openedQty - (consumedBeforeStart.get(asset) ?? 0) > 0.000001) activeInPeriod.add(asset);
  }

  const expectedDays = Math.min(days, days <= 90 ? days : Math.ceil(days / 7));
  const refreshing   = [...activeInPeriod]
    .filter(a => fetchable.has(a))
    .some(a => (pricesByAsset.get(a)?.size ?? 0) < expectedDays * 0.5);

  // Generar serie de fechas
  const step  = days <= 90 ? 1 : 7;
  const dates: Date[] = [];
  const cur   = new Date(startDate);
  while (cur <= endDate) { dates.push(new Date(cur)); cur.setDate(cur.getDate() + step); }

  const points: { date: string; value: number }[] = [];

  for (const date of dates) {
    const dateStr = date.toISOString().slice(0, 10);

    // Holdings en esta fecha
    const holdings = new Map<string, number>();
    for (const lot of lots) {
      if (lot.opened_at <= date)
        holdings.set(lot.asset, (holdings.get(lot.asset) ?? 0) + lot.qty);
    }
    for (const cons of consumptions) {
      if (cons.consumed_at <= date)
        holdings.set(cons.asset, (holdings.get(cons.asset) ?? 0) - cons.qty);
    }

    let totalValue = 0, pricedAssets = 0, totalAssets = 0;

    for (const [asset, qty] of holdings) {
      if (qty < 0.000001) continue;
      totalAssets++;
      if (asset === 'EUR') { totalValue += qty; pricedAssets++; continue; }

      const assetPrices = pricesByAsset.get(asset);
      let price = assetPrices?.get(dateStr);

      if (price === undefined) {
        for (let offset = 1; offset <= 7 && price === undefined; offset++) {
          const prev = new Date(date);
          prev.setDate(prev.getDate() - offset);
          price = assetPrices?.get(prev.toISOString().slice(0, 10));
        }
      }

      if (price !== undefined) { totalValue += qty * price; pricedAssets++; }
    }

    if (totalAssets > 0 && pricedAssets / totalAssets >= 0.6)
      points.push({ date: dateStr, value: Math.round(totalValue * 100) / 100 });
  }

  return { points, refreshing };
}

// Evitar bucles: rastrea cuándo se lanzó el último fetch por periodo
const refreshingPeriods = new Set<string>();
const lastFetchAttempt  = new Map<string, number>(); // period → timestamp ms
const REFETCH_COOLDOWN  = 2 * 60 * 1000; // 2 minutos entre intentos

// GET /api/fifo/portfolio-history?period=1m|3m|6m|1y|all
router.get('/portfolio-history', async (req, res) => {
  try {
    const period  = (req.query.period as string) ?? '1y';
    const daysMap: Record<string, number> = { '1m': 30, '3m': 90, '6m': 180, '1y': 365, 'all': 1825 };
    const days    = daysMap[period] ?? 365;

    // Cargar lotes y consumos
    const lotsRes = await db.query(`SELECT asset, quantity_original::float AS qty, opened_at FROM fifo_lots ORDER BY opened_at`);
    const consRes = await db.query(`
      SELECT fl.asset, flc.quantity_consumed::float AS qty, flc.consumed_at
      FROM fifo_lot_consumptions flc JOIN fifo_lots fl ON fl.id = flc.lot_id
      ORDER BY flc.consumed_at`);

    const lots        = lotsRes.rows.map((r: { asset: string; qty: number; opened_at: string }) => ({ ...r, opened_at: new Date(r.opened_at) }));
    const consumptions = consRes.rows.map((r: { asset: string; qty: number; consumed_at: string }) => ({ ...r, consumed_at: new Date(r.consumed_at) }));
    const allAssets   = [...new Set(lots.map((l: { asset: string }) => l.asset))].filter((a: string) => a !== 'EUR');

    // 1. Responder con datos de caché inmediatamente
    const { points, refreshing } = await computeHistoryFromCache(days, lots, consumptions);
    res.json({ points, period, refreshing });

    // 2. Si faltan precios, fetch en background con cooldown para evitar bucles
    const lastAttempt = lastFetchAttempt.get(period) ?? 0;
    const cooldownOk  = Date.now() - lastAttempt > REFETCH_COOLDOWN;

    if (refreshing && !refreshingPeriods.has(period) && cooldownOk) {
      refreshingPeriods.add(period);
      lastFetchAttempt.set(period, Date.now());
      loadCoinGeckoMetadata()
        .then(() => Promise.all(allAssets.map((asset: string) => fetchMarketChart(asset, days).catch(() => {}))))
        .catch(() => {})
        .finally(() => refreshingPeriods.delete(period));
    }
  } catch (e) {
    sendInternalError(res, e, 'GET /api/fifo/portfolio-history');
  }
});

export default router;
