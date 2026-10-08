import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { autoDetectPair } from '../../modules/prices/pairDetector';
import { updateCoinGeckoId } from '../../modules/prices/coingecko';
import { MAX_LENGTH_SHORT } from '../../modules/validation/textLength';
import { sendZodError, validateSymbol } from './settingsShared';
import { sendInternalError } from '../../middleware/errorHandler';
import { requestLivePriceResync } from '../../modules/prices/liveFeed';

const router = Router();

// Formaliza con Zod los 7 campos que antes solo validaban `symbol` con
// SYMBOL_RE de forma manual; incorpora el límite de longitud de `name`.
const createAssetSchema = z.object({
  symbol:          z.string().min(1, 'El símbolo es requerido').max(20, 'El símbolo es demasiado largo'),
  name:            z.string().max(MAX_LENGTH_SHORT, `name no puede superar ${MAX_LENGTH_SHORT} caracteres`).nullish(),
  binanceEurPair:  z.string().max(MAX_LENGTH_SHORT, `binanceEurPair no puede superar ${MAX_LENGTH_SHORT} caracteres`).nullish(),
  binanceUsdtPair: z.string().max(MAX_LENGTH_SHORT, `binanceUsdtPair no puede superar ${MAX_LENGTH_SHORT} caracteres`).nullish(),
  binanceBtcPair:  z.string().max(MAX_LENGTH_SHORT, `binanceBtcPair no puede superar ${MAX_LENGTH_SHORT} caracteres`).nullish(),
  isStablecoin:    z.boolean().nullish(),
  coingecko_id:    z.string().max(MAX_LENGTH_SHORT, `coingecko_id no puede superar ${MAX_LENGTH_SHORT} caracteres`).nullish(),
});

const updateAssetSchema = z.object({
  name:            z.string().max(MAX_LENGTH_SHORT, `name no puede superar ${MAX_LENGTH_SHORT} caracteres`).nullish(),
  binanceEurPair:  z.string().max(MAX_LENGTH_SHORT, `binanceEurPair no puede superar ${MAX_LENGTH_SHORT} caracteres`).nullish(),
  binanceUsdtPair: z.string().max(MAX_LENGTH_SHORT, `binanceUsdtPair no puede superar ${MAX_LENGTH_SHORT} caracteres`).nullish(),
  binanceBtcPair:  z.string().max(MAX_LENGTH_SHORT, `binanceBtcPair no puede superar ${MAX_LENGTH_SHORT} caracteres`).nullish(),
  isStablecoin:    z.boolean().nullish(),
});

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
  const validation = createAssetSchema.safeParse(req.body);
  if (!validation.success) {
    sendZodError(res, validation.error);
    return;
  }
  const { symbol, name, binanceEurPair, binanceUsdtPair, binanceBtcPair, isStablecoin, coingecko_id } = validation.data;

  const upperSymbol = symbol.toUpperCase().trim();

  let priceSource = 'unknown';
  if (isStablecoin) priceSource = 'fiat';
  else if (binanceEurPair) priceSource = 'eur_direct';
  else if (binanceUsdtPair) priceSource = 'usdt_proxy';
  else if (binanceBtcPair) priceSource = 'btc_proxy';
  else if (coingecko_id) priceSource = 'coingecko';

  await db.query(
    `INSERT INTO asset_metadata (
      symbol, name, is_stablecoin,
      binance_eur_pair, binance_usdt_pair, binance_btc_pair,
      coingecko_id, price_source, auto_detected, last_price_check
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, NOW())
    ON CONFLICT (symbol) DO UPDATE SET
      name              = EXCLUDED.name,
      is_stablecoin     = EXCLUDED.is_stablecoin,
      binance_eur_pair  = EXCLUDED.binance_eur_pair,
      binance_usdt_pair = EXCLUDED.binance_usdt_pair,
      binance_btc_pair  = EXCLUDED.binance_btc_pair,
      coingecko_id      = COALESCE(EXCLUDED.coingecko_id, asset_metadata.coingecko_id),
      price_source      = EXCLUDED.price_source,
      last_price_check  = NOW()`,
    [upperSymbol, name || upperSymbol, isStablecoin || false,
     binanceEurPair || null, binanceUsdtPair || null, binanceBtcPair || null,
     coingecko_id || null, priceSource]
  );

  // Recargar el map en memoria si se proporcionó coingecko_id
  if (coingecko_id) {
    await updateCoinGeckoId(upperSymbol, coingecko_id);
  }

  requestLivePriceResync(); // nuevo activo o pares modificados → feed en vivo (#149)
  res.json({ success: true, symbol: upperSymbol });
});

// ── PUT /api/settings/assets/:symbol ──────────────────────────────────────
router.put('/assets/:symbol', async (req: Request, res: Response) => {
  const { symbol } = req.params;

  const validation = updateAssetSchema.safeParse(req.body);
  if (!validation.success) {
    sendZodError(res, validation.error);
    return;
  }
  const { name, binanceEurPair, binanceUsdtPair, binanceBtcPair, isStablecoin } = validation.data;

  let priceSource = 'unknown';
  if (isStablecoin) priceSource = 'fiat';
  else if (binanceEurPair) priceSource = 'eur_direct';
  else if (binanceUsdtPair) priceSource = 'usdt_proxy';
  else if (binanceBtcPair) priceSource = 'btc_proxy';

  await db.query(
    `UPDATE asset_metadata SET
      name              = COALESCE($1, name),
      is_stablecoin     = $2,
      binance_eur_pair  = $3,
      binance_usdt_pair = $4,
      binance_btc_pair  = $5,
      price_source      = $6,
      last_price_check  = NOW()
     WHERE symbol = $7`,
    [name || null, isStablecoin || false, binanceEurPair || null,
     binanceUsdtPair || null, binanceBtcPair || null, priceSource, symbol.toUpperCase()]
  );

  requestLivePriceResync();
  res.json({ success: true });
});

// ── DELETE /api/settings/assets/:symbol ───────────────────────────────────
router.delete('/assets/:symbol', async (req: Request, res: Response) => {
  const symbol = validateSymbol(req.params.symbol);
  if (!symbol) { res.status(400).json({ error: 'Símbolo inválido' }); return; }

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

  requestLivePriceResync();
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

  requestLivePriceResync();
  res.json({ detected, failed, total: unknownRes.rows.length });
});

// ── POST /api/settings/assets/:symbol/detect ──────────────────────────────
router.post('/assets/:symbol/detect', async (req: Request, res: Response) => {
  const symbol = validateSymbol(req.params.symbol);
  if (!symbol) { res.status(400).json({ error: 'Símbolo inválido' }); return; }
  try {
    // Limpiar sentinelas de precio previos (-1) para que se reintente CoinGecko si aplica
    await db.query(
      "DELETE FROM price_cache WHERE asset = $1 AND price_eur < 0",
      [symbol]
    );
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
    requestLivePriceResync();
    res.json(result.rows[0]);
  } catch (err) {
    sendInternalError(res, err, '/assets/:symbol/detect', 'Error al detectar el activo');
  }
});

export default router;
