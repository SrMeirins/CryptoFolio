import { Router, Request, Response } from 'express';
import { db } from '../db/client';
import { autoDetectPair, testPair } from '../modules/prices/pairDetector';

const router = Router();

// GET /api/settings/assets — Lista todos los activos
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

// POST /api/settings/assets — Añadir activo manualmente
router.post('/assets', async (req: Request, res: Response) => {
  const { symbol, name, binanceEurPair, binanceUsdtPair, binanceBtcPair, isStablecoin } = req.body;

  if (!symbol) {
    res.status(400).json({ error: 'El símbolo es requerido' });
    return;
  }

  const upperSymbol = symbol.toUpperCase().trim();

  // Determinar price_source
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

// PUT /api/settings/assets/:symbol — Actualizar activo
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

// POST /api/settings/assets/:symbol/detect — Auto-detectar pares
router.post('/assets/:symbol/detect', async (req: Request, res: Response) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const info = await autoDetectPair(symbol);
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/settings/pairs/test — Probar si un par existe en Binance
router.post('/pairs/test', async (req: Request, res: Response) => {
  const { pair } = req.body;
  if (!pair) { res.status(400).json({ error: 'Par requerido' }); return; }
  const result = await testPair(pair.toUpperCase());
  res.json(result);
});

export default router;
