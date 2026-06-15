import { Router } from 'express';
import { runFifoEngine } from '../modules/fifo/engine';
import { loadAssetMetadata, prefetchHistoricalPrices } from '../modules/prices/binance';
import { fetchMarketChart, loadAssetMetadata as loadCoinGeckoMetadata } from '../modules/prices/coingecko';
import { db } from '../db/client';

const router = Router();

// POST /api/fifo/run — Ejecutar el motor FIFO completo
router.post('/run', async (_req, res) => {
  try {
    // 1. Asegurar metadata cargada
    await loadAssetMetadata();

    // 2. Detectar todos los precios históricos necesarios
    const txRes = await db.query(
      `SELECT DISTINCT cost_asset AS symbol, DATE(timestamp) AS date
       FROM transactions
       WHERE cost_asset IS NOT NULL
         AND cost_asset NOT IN ('EUR')
         AND operation_type IN ('BUY', 'SELL')
       UNION
       SELECT DISTINCT fee_asset AS symbol, DATE(timestamp) AS date
       FROM transactions
       WHERE fee_asset IS NOT NULL
         AND fee_asset NOT IN ('EUR')
       ORDER BY date`
    );

    const required = txRes.rows.map((r: { symbol: string; date: string }) => ({
      symbol: r.symbol,
      date: new Date(r.date),
    }));

    // 3. Precargar precios (respeta rate limit automáticamente)
    await prefetchHistoricalPrices(required);

    // 4. Ejecutar motor FIFO
    const result = await runFifoEngine();

    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/fifo/summary — Resumen fiscal por año
router.get('/summary', async (_req, res) => {
  const result = await db.query('SELECT * FROM v_fiscal_year ORDER BY fiscal_year');
  res.json(result.rows);
});

// GET /api/fifo/fiat-balances — Saldo de activos fiat (EUR) por wallet
// Calcula: depósitos + conversiones cripto→EUR - compras con EUR - retiradas
router.get('/fiat-balances', async (_req, res) => {
  const FIAT_ASSETS = ['EUR'];
  // EUR balance neto por wallet: suma de todos los flujos EUR (en/out) por wallet.
  // Se combinan las dos "perspectivas" del EUR: cuando es asset directo (depósito,
  // recepción de venta cripto→EUR) y cuando es cost_asset (pago por compra de cripto).
  const fiatClause = FIAT_ASSETS.map((_, i) => `$${i + 1}`).join(', ');
  // EUR es fungible entre sub-wallets (Spot, Funding…) → agrupamos por wallet_kind.
  // Solo se consideran salidas de EUR desde la fecha del primer depósito registrado:
  // los gastos previos al CSV se financiaron con depósitos externos no rastreados.
  const result = await db.query(
    `WITH fiat_flows AS (
       -- Flujos donde EUR es el activo directo (depósitos, retiradas, conversiones cripto→EUR)
       SELECT w.type AS wallet_kind, asset AS fiat_asset,
              CASE
                WHEN operation_type = 'DEPOSIT_FIAT'  THEN  amount
                WHEN operation_type = 'BUY'           THEN  amount_net
                WHEN operation_type = 'WITHDRAW_FIAT' THEN -amount
                ELSE 0
              END AS flow
       FROM transactions t JOIN wallets w ON w.id = t.wallet_id
       WHERE asset IN (${fiatClause})
         AND operation_type IN ('DEPOSIT_FIAT', 'BUY', 'WITHDRAW_FIAT')

       UNION ALL

       -- Flujos donde EUR es el activo de coste (pagos con EUR para BUY, EUR recibido en SELL)
       SELECT w.type AS wallet_kind, cost_asset AS fiat_asset,
              CASE
                WHEN operation_type IN ('BUY','BUY_FIAT','BUY_CRYPTO','FEE_EXCHANGE') THEN -COALESCE(cost_amount, 0)
                WHEN operation_type IN ('SELL','SELL_FIAT')                           THEN  COALESCE(cost_amount, 0)
                ELSE 0
              END AS flow
       FROM transactions t
       JOIN wallets w ON w.id = t.wallet_id
       WHERE cost_asset IN (${fiatClause})
         AND operation_type IN ('BUY','BUY_FIAT','BUY_CRYPTO','SELL','SELL_FIAT','FEE_EXCHANGE')
     ),
     wallet_rep AS (
       -- Wallet representante de cada tipo (la que tiene el depósito fiat = la principal)
       SELECT DISTINCT ON (type)
         id, name, color, type
       FROM wallets
       WHERE is_system = TRUE
       ORDER BY type,
         CASE WHEN name ILIKE '%spot%' THEN 0 WHEN name ILIKE '%funding%' THEN 1 ELSE 2 END
     )
     SELECT
       wr.id    AS wallet_id,
       wr.name  AS wallet_name,
       wr.color AS wallet_color,
       wr.type  AS wallet_kind,
       f.fiat_asset AS asset,
       ROUND(SUM(f.flow)::numeric, 2) AS balance
     FROM fiat_flows f
     JOIN wallet_rep wr ON wr.type = f.wallet_kind
     GROUP BY wr.id, wr.name, wr.color, wr.type, f.fiat_asset
     HAVING ROUND(SUM(f.flow)::numeric, 2) > 0.005
     ORDER BY balance DESC`,
    FIAT_ASSETS
  );
  res.json(result.rows);
});

// GET /api/fifo/eur-flow — Euros depositados, retirados y neto invertido en cripto
router.get('/eur-flow', async (_req, res) => {
  const result = await db.query(`
    SELECT
      COALESCE(SUM(CASE WHEN operation_type = 'DEPOSIT_FIAT'  AND asset = 'EUR' THEN amount     ELSE 0 END), 0) AS deposited,
      COALESCE(SUM(CASE WHEN operation_type = 'WITHDRAW_FIAT' AND asset = 'EUR' THEN amount     ELSE 0 END), 0) AS withdrawn,
      COALESCE(SUM(CASE WHEN operation_type IN ('BUY','BUY_FIAT') AND cost_asset = 'EUR'        THEN cost_amount ELSE 0 END), 0) AS eur_spent_buying,
      COALESCE(SUM(CASE WHEN operation_type IN ('SELL','SELL_FIAT') AND cost_asset = 'EUR'      THEN cost_amount ELSE 0 END), 0) AS eur_received_selling
    FROM transactions
  `);
  const row = result.rows[0];
  const deposited          = parseFloat(row.deposited);
  const withdrawn          = parseFloat(row.withdrawn);
  const eurSpentBuying     = parseFloat(row.eur_spent_buying);
  const eurReceivedSelling = parseFloat(row.eur_received_selling);
  res.json({
    deposited,
    withdrawn,
    netFromBank: deposited - withdrawn,         // EUR neto desde el banco
    eurSpentBuying,
    eurReceivedSelling,
    netInvested: eurSpentBuying - eurReceivedSelling,  // EUR neto gastado en cripto
  });
});

// GET /api/fifo/realized-pnl — P&L realizado histórico por activo
router.get('/realized-pnl', async (_req, res) => {
  const result = await db.query(`
    SELECT
      fl.asset,
      COUNT(flc.id)::int                                                              AS operations,
      ROUND(SUM(CASE WHEN flc.gain_loss_eur > 0 THEN flc.gain_loss_eur ELSE 0 END)::numeric, 2) AS realized_gains,
      ROUND(SUM(CASE WHEN flc.gain_loss_eur < 0 THEN flc.gain_loss_eur ELSE 0 END)::numeric, 2) AS realized_losses,
      ROUND(SUM(flc.gain_loss_eur)::numeric, 2)                                       AS net_pnl,
      ROUND(SUM(flc.quantity_consumed)::numeric, 8)                                   AS total_sold,
      MIN(flc.consumed_at)::date                                                       AS first_sale,
      MAX(flc.consumed_at)::date                                                       AS last_sale
    FROM fifo_lot_consumptions flc
    JOIN fifo_lots fl ON fl.id = flc.lot_id
    WHERE flc.fiscal_event_type != 'NONE'
    GROUP BY fl.asset
    ORDER BY net_pnl ASC
  `);

  const rows = result.rows;
  const totalGains  = rows.reduce((s: number, r: { realized_gains: string }) => s + parseFloat(r.realized_gains), 0);
  const totalLosses = rows.reduce((s: number, r: { realized_losses: string }) => s + parseFloat(r.realized_losses), 0);
  const netPnl      = totalGains + totalLosses;

  res.json({ totalGains, totalLosses, netPnl, byAsset: rows });
});

// GET /api/fifo/lots — Lotes FIFO abiertos actualmente
router.get('/lots', async (_req, res) => {
  const result = await db.query(
    `SELECT
       fl.asset,
       fl.wallet_id,
       w.name  AS wallet_name,
       w.color AS wallet_color,
       w.type  AS wallet_kind,
       SUM(fl.quantity_remaining)  AS quantity,
       SUM(fl.cost_basis_eur)      AS cost_basis_eur,
       -- Media ponderada por cantidad (no media simple)
       SUM(fl.quantity_remaining * fl.price_per_unit_eur)
         / NULLIF(SUM(fl.quantity_remaining), 0) AS avg_price_eur
     FROM fifo_lots fl
     JOIN wallets w ON w.id = fl.wallet_id
     WHERE fl.is_closed = FALSE AND fl.quantity_remaining > 0
     GROUP BY fl.asset, fl.wallet_id, w.name, w.color, w.type
     ORDER BY fl.asset, w.name`
  );
  res.json(result.rows);
});

// GET /api/fifo/locked — Cantidades netas bloqueadas en staking/launchpool (LOCK - UNLOCK) por wallet+activo
router.get('/locked', async (_req, res) => {
  const result = await db.query(
    `SELECT
       wallet_id,
       wallet_name,
       wallet_color,
       asset,
       staking_type,
       lock_kind,
       SUM(CASE WHEN op IN ('STAKING_LOCK','LAUNCHPOOL_LOCK')     THEN amount_net ELSE 0 END)
     - SUM(CASE WHEN op IN ('STAKING_UNLOCK','LAUNCHPOOL_UNLOCK') THEN amount_net ELSE 0 END) AS locked_amount
     FROM (
       SELECT t.wallet_id, w.name AS wallet_name, w.color AS wallet_color,
              t.asset, t.operation_type AS op, t.amount_net,
              -- Para UNLOCKs usamos las notes del LOCK enlazado (linked_tx_id) en lugar de
              -- las del propio UNLOCK. Binance renombra productos a mitad de ciclo
              -- (ej. "Staking Purchase" → redimido como "Simple Earn Locked Redemption"),
              -- así que el UNLOCK tiene notes distintas al LOCK, y sin este join no se
              -- cancelarían en el GROUP BY.
              CASE t.operation_type
                WHEN 'STAKING_LOCK'      THEN t.notes
                WHEN 'STAKING_UNLOCK'    THEN COALESCE(
                  (SELECT t2.notes FROM transactions t2 WHERE t2.id = t.linked_tx_id),
                  t.notes
                )
                WHEN 'LAUNCHPOOL_LOCK'   THEN t.notes
                WHEN 'LAUNCHPOOL_UNLOCK' THEN COALESCE(
                  (SELECT t2.notes FROM transactions t2 WHERE t2.id = t.linked_tx_id),
                  t.notes
                )
              END AS staking_type,
              CASE WHEN t.operation_type IN ('LAUNCHPOOL_LOCK','LAUNCHPOOL_UNLOCK')
                   THEN 'launchpool' ELSE 'staking' END AS lock_kind
       FROM transactions t
       JOIN wallets w ON w.id = t.wallet_id
       WHERE t.operation_type IN ('STAKING_LOCK','STAKING_UNLOCK','LAUNCHPOOL_LOCK','LAUNCHPOOL_UNLOCK')
     ) sub
     GROUP BY wallet_id, wallet_name, wallet_color, asset, staking_type, lock_kind
     HAVING SUM(CASE WHEN op IN ('STAKING_LOCK','LAUNCHPOOL_LOCK')     THEN amount_net ELSE 0 END)
          - SUM(CASE WHEN op IN ('STAKING_UNLOCK','LAUNCHPOOL_UNLOCK') THEN amount_net ELSE 0 END) > 0.000001
     ORDER BY asset, wallet_name`
  );
  res.json(result.rows);
});

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
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/fifo/yesterday-prices — openPrice de Binance 24h ticker para activos en cartera
// "openPrice" = precio hace exactamente 24 h (ventana deslizante de Binance)
let _ydayCache: { prices: Record<string, number>; at: number } | null = null;
const YDAY_TTL = 5 * 60_000; // 5 min

router.get('/yesterday-prices', async (_req, res) => {
  try {
    // Servir desde caché si es reciente
    if (_ydayCache && Date.now() - _ydayCache.at < YDAY_TTL) {
      return res.json({ prices: _ydayCache.prices });
    }

    // Activos en posición abierta con su info de par Binance
    const lotsResult = await db.query(`
      SELECT DISTINCT fl.asset,
             am.binance_eur_pair,
             am.binance_usdt_pair,
             am.price_source,
             am.is_stablecoin
      FROM fifo_lots fl
      LEFT JOIN asset_metadata am ON am.symbol = fl.asset
      WHERE fl.is_closed = FALSE AND fl.quantity_remaining > 0
    `);

    const pairMap = new Map<string, { asset: string; isUsdt: boolean }[]>();
    let needsEurUsdt = false;

    for (const row of lotsResult.rows as {
      asset: string; binance_eur_pair: string | null; binance_usdt_pair: string | null;
      price_source: string; is_stablecoin: boolean
    }[]) {
      if (row.price_source === 'fiat' || row.is_stablecoin) continue;
      if (row.binance_eur_pair) {
        const list = pairMap.get(row.binance_eur_pair) ?? [];
        list.push({ asset: row.asset, isUsdt: false });
        pairMap.set(row.binance_eur_pair, list);
      } else if (row.binance_usdt_pair) {
        const list = pairMap.get(row.binance_usdt_pair) ?? [];
        list.push({ asset: row.asset, isUsdt: true });
        pairMap.set(row.binance_usdt_pair, list);
        needsEurUsdt = true;
      }
    }

    const allPairs = [...pairMap.keys(), ...(needsEurUsdt ? ['EURUSDT'] : [])];
    if (allPairs.length === 0) {
      _ydayCache = { prices: {}, at: Date.now() };
      return res.json({ prices: {} });
    }

    const symbols = encodeURIComponent(JSON.stringify(allPairs));
    const tickerRes = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbols=${symbols}&type=MINI`
    );
    if (!tickerRes.ok) throw new Error(`Binance 24hr ticker: HTTP ${tickerRes.status}`);

    const tickers = await tickerRes.json() as Array<{ symbol: string; openPrice: string }>;
    const tickerMap = new Map(tickers.map(t => [t.symbol, parseFloat(t.openPrice)]));

    const eurusdtOpen = tickerMap.get('EURUSDT');
    const eurRateOpen = eurusdtOpen && eurusdtOpen > 0 ? 1 / eurusdtOpen : null;

    const prices: Record<string, number> = {};
    for (const [pair, assets] of pairMap) {
      const openPrice = tickerMap.get(pair);
      if (!openPrice || openPrice <= 0) continue;
      for (const { asset, isUsdt } of assets) {
        if (!isUsdt) {
          prices[asset] = openPrice;
        } else if (eurRateOpen) {
          prices[asset] = openPrice * eurRateOpen;
        }
      }
    }

    _ydayCache = { prices, at: Date.now() };
    res.json({ prices });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
