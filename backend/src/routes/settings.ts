import { Router, Request, Response } from 'express';
import { db } from '../db/client';
import { autoDetectPair, testPair } from '../modules/prices/pairDetector';

const router = Router();

// ── GET /api/settings/assets ───────────────────────────────────────────────
router.get('/assets', async (_req: Request, res: Response) => {
  const result = await db.query(
    `SELECT symbol, name, coingecko_id, is_stablecoin,
            binance_eur_pair, binance_usdt_pair, binance_btc_pair,
            price_source, auto_detected, last_price_check
     FROM asset_metadata
     ORDER BY symbol`
  );
  res.json(result.rows);
});

// ── POST /api/settings/assets ──────────────────────────────────────────────
router.post('/assets', async (req: Request, res: Response) => {
  const { symbol, name, binanceEurPair, binanceUsdtPair, binanceBtcPair, isStablecoin } = req.body;

  if (!symbol) {
    res.status(400).json({ error: 'El simbolo es requerido' });
    return;
  }

  const upperSymbol = symbol.toUpperCase().trim();

  let priceSource = 'unknown';
  if (isStablecoin) priceSource = 'fiat';
  else if (binanceEurPair) priceSource = 'eur_direct';
  else if (binanceUsdtPair) priceSource = 'usdt_proxy';
  else if (binanceBtcPair) priceSource = 'btc_proxy';

  await db.query(
    `INSERT INTO asset_metadata (
      symbol, name, is_stablecoin,
      binance_eur_pair, binance_usdt_pair, binance_btc_pair,
      price_source, auto_detected, last_price_check
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, NOW())
    ON CONFLICT (symbol) DO UPDATE SET
      name              = EXCLUDED.name,
      is_stablecoin     = EXCLUDED.is_stablecoin,
      binance_eur_pair  = EXCLUDED.binance_eur_pair,
      binance_usdt_pair = EXCLUDED.binance_usdt_pair,
      binance_btc_pair  = EXCLUDED.binance_btc_pair,
      price_source      = EXCLUDED.price_source,
      last_price_check  = NOW()`,
    [upperSymbol, name || upperSymbol, isStablecoin || false,
     binanceEurPair || null, binanceUsdtPair || null, binanceBtcPair || null, priceSource]
  );

  res.json({ success: true, symbol: upperSymbol });
});

// ── PUT /api/settings/assets/:symbol ──────────────────────────────────────
router.put('/assets/:symbol', async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const { name, binanceEurPair, binanceUsdtPair, binanceBtcPair, isStablecoin } = req.body;

  let priceSource = 'unknown';
  if (isStablecoin) priceSource = 'fiat';
  else if (binanceEurPair) priceSource = 'eur_direct';
  else if (binanceUsdtPair) priceSource = 'usdt_proxy';
  else if (binanceBtcPair) priceSource = 'btc_proxy';

  await db.query(
    `UPDATE asset_metadata SET
      name              = $1,
      is_stablecoin     = $2,
      binance_eur_pair  = $3,
      binance_usdt_pair = $4,
      binance_btc_pair  = $5,
      price_source      = $6,
      last_price_check  = NOW()
     WHERE symbol = $7`,
    [name, isStablecoin || false, binanceEurPair || null,
     binanceUsdtPair || null, binanceBtcPair || null, priceSource, symbol.toUpperCase()]
  );

  res.json({ success: true });
});

// ── DELETE /api/settings/assets/:symbol ───────────────────────────────────
router.delete('/assets/:symbol', async (req: Request, res: Response) => {
  const symbol = req.params.symbol.toUpperCase();

  const txCheck = await db.query(
    'SELECT COUNT(*) FROM transactions WHERE asset = $1',
    [symbol]
  );
  const txCount = parseInt(txCheck.rows[0].count);

  if (txCount > 0) {
    res.status(409).json({
      error: `No se puede borrar: "${symbol}" tiene ${txCount} transacciones asociadas.`,
    });
    return;
  }

  const deleted = await db.query(
    'DELETE FROM asset_metadata WHERE symbol = $1 RETURNING symbol',
    [symbol]
  );

  if (deleted.rows.length === 0) {
    res.status(404).json({ error: 'Activo no encontrado' });
    return;
  }

  res.json({ success: true, symbol });
});

// ── POST /api/settings/assets/detect-all ──────────────────────────────────
router.post('/assets/detect-all', async (_req: Request, res: Response) => {
  const unknownRes = await db.query(
    `SELECT symbol FROM asset_metadata
     WHERE price_source = 'unknown' AND is_stablecoin = FALSE
     ORDER BY symbol`
  );

  let detected = 0;
  let failed = 0;

  for (const { symbol } of unknownRes.rows) {
    try {
      const info = await autoDetectPair(symbol);
      if (info.priceSource !== 'unknown') detected++;
      else failed++;
    } catch {
      failed++;
    }
    await new Promise(r => setTimeout(r, 250));
  }

  res.json({ detected, failed, total: unknownRes.rows.length });
});

// ── POST /api/settings/assets/:symbol/detect ──────────────────────────────
router.post('/assets/:symbol/detect', async (req: Request, res: Response) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    await autoDetectPair(symbol);
    const result = await db.query(
      `SELECT symbol, name, is_stablecoin,
              binance_eur_pair, binance_usdt_pair, binance_btc_pair,
              price_source, auto_detected, last_price_check
       FROM asset_metadata WHERE symbol = $1`,
      [symbol]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Activo no encontrado tras detección' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /api/settings/pairs/test ─────────────────────────────────────────
router.post('/pairs/test', async (req: Request, res: Response) => {
  const { pair } = req.body;
  if (!pair) { res.status(400).json({ error: 'Par requerido' }); return; }
  const result = await testPair(pair.toUpperCase());
  res.json(result);
});

// ── GET /api/settings/config ───────────────────────────────────────────────
router.get('/config', async (_req: Request, res: Response) => {
  const result = await db.query('SELECT key, value FROM app_config');
  const config: Record<string, string> = {};
  for (const row of result.rows) config[row.key] = row.value;
  res.json(config);
});

// ── PUT /api/settings/config ───────────────────────────────────────────────
router.put('/config', async (req: Request, res: Response) => {
  const { key, value } = req.body;
  if (!key || value === undefined) {
    res.status(400).json({ error: 'key y value son requeridos' });
    return;
  }
  await db.query(
    `INSERT INTO app_config (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, String(value)]
  );
  res.json({ success: true });
});

// ── GET /api/settings/stats ────────────────────────────────────────────────
router.get('/stats', async (_req: Request, res: Response) => {
  const [txs, lots, imports, cache, wallets, assets] = await Promise.all([
    db.query('SELECT COUNT(*) FROM transactions'),
    db.query('SELECT COUNT(*) FROM fifo_lots'),
    db.query('SELECT COUNT(*) FROM csv_imports'),
    db.query('SELECT COUNT(*) FROM price_cache'),
    db.query('SELECT COUNT(*) FROM wallets'),
    db.query('SELECT COUNT(*) FROM asset_metadata'),
  ]);
  res.json({
    transactions: parseInt(txs.rows[0].count),
    fifoLots:     parseInt(lots.rows[0].count),
    imports:      parseInt(imports.rows[0].count),
    priceCache:   parseInt(cache.rows[0].count),
    wallets:      parseInt(wallets.rows[0].count),
    assets:       parseInt(assets.rows[0].count),
  });
});

// ── DELETE /api/settings/price-cache ──────────────────────────────────────
router.delete('/price-cache', async (_req: Request, res: Response) => {
  const result = await db.query('DELETE FROM price_cache RETURNING id');
  res.json({ deleted: result.rows.length });
});

// ── GET /api/settings/notifications ───────────────────────────────────────
// Recopila avisos del sistema clasificados por severidad
router.get('/notifications', async (_req: Request, res: Response) => {
  const notifications: Array<{
    id: string; type: 'error' | 'warning' | 'info'; category: string; message: string; count?: number;
  }> = [];

  // 1. Activos sin precio configurado (no stablecoin)
  const noPriceRes = await db.query(
    `SELECT symbol FROM asset_metadata WHERE price_source = 'unknown' AND is_stablecoin = FALSE ORDER BY symbol`
  );
  if (noPriceRes.rows.length > 0) {
    notifications.push({
      id: 'no-price',
      type: 'warning',
      category: 'Precios',
      message: `${noPriceRes.rows.length} activo${noPriceRes.rows.length > 1 ? 's' : ''} sin precio configurado: ${noPriceRes.rows.map((r: {symbol: string}) => r.symbol).join(', ')}`,
      count: noPriceRes.rows.length,
    });
  }

  // 2. Retiros sin wallet destino asignada
  const pendingRes = await db.query(
    `SELECT asset, COUNT(*) as cnt FROM transactions WHERE destination_pending = TRUE GROUP BY asset ORDER BY asset`
  );
  if (pendingRes.rows.length > 0) {
    const total = pendingRes.rows.reduce((s: number, r: {cnt: string}) => s + parseInt(r.cnt), 0);
    const assets = pendingRes.rows.map((r: {asset: string}) => r.asset).join(', ');
    notifications.push({
      id: 'pending-withdrawals',
      type: 'warning',
      category: 'Retiros',
      message: `${total} retiro${total > 1 ? 's' : ''} sin wallet destino asignada (${assets}). Ve a Historial para asignarlos.`,
      count: total,
    });
  }

  // 3. Depósitos de cripto externo que requieren revisión
  const cryptoDepositRes = await db.query(
    `SELECT COUNT(*) AS cnt FROM transactions
     WHERE operation_type = 'AIRDROP'
       AND notes LIKE '%Depósito de cripto externo%'`
  );
  const cryptoDepositCount = parseInt(cryptoDepositRes.rows[0].cnt);
  if (cryptoDepositCount > 0) {
    notifications.push({
      id: 'crypto-deposits',
      type: 'info',
      category: 'Depósitos',
      message: `${cryptoDepositCount} depósito${cryptoDepositCount > 1 ? 's' : ''} de cripto externo con coste de adquisición desconocido. Revisa y ajusta si es necesario.`,
      count: cryptoDepositCount,
    });
  }

  // 4. Lotes FIFO con activo sin precio (no se puede valorar el portfolio)
  const noLotPriceRes = await db.query(
    `SELECT DISTINCT fl.asset
     FROM fifo_lots fl
     LEFT JOIN asset_metadata am ON am.symbol = fl.asset
     WHERE fl.is_closed = FALSE
       AND fl.quantity_remaining > 0
       AND (am.price_source = 'unknown' OR am.symbol IS NULL)
     ORDER BY fl.asset`
  );
  if (noLotPriceRes.rows.length > 0) {
    const assets = noLotPriceRes.rows.map((r: {asset: string}) => r.asset).join(', ');
    notifications.push({
      id: 'lots-no-price',
      type: 'error',
      category: 'Portfolio',
      message: `Activos en cartera sin precio de mercado: ${assets}. El valor del portfolio puede estar incompleto.`,
      count: noLotPriceRes.rows.length,
    });
  }

  res.json(notifications);
});

// ── DELETE /api/settings/data/transactions ────────────────────────────────
// Elimina todas las transacciones, lotes FIFO e importaciones.
// La configuración (wallets, activos, app_config) se conserva.
router.delete('/data/transactions', async (_req: Request, res: Response) => {
  await db.transaction(async (client) => {
    await client.query('DELETE FROM fifo_lot_consumptions');
    await client.query('DELETE FROM fifo_lots');
    await client.query('DELETE FROM raw_transactions');
    await client.query('DELETE FROM transactions');
    await client.query('DELETE FROM csv_imports');
    await client.query('DELETE FROM price_cache');
  });
  res.json({ success: true });
});

export default router;