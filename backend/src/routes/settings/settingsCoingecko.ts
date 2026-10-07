import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { testPair } from '../../modules/prices/pairDetector';
import { updateCoinGeckoId, verifyCoinGeckoId } from '../../modules/prices/coingecko';
import { coingeckoIdSchema, sendZodError, validateSymbol } from './settingsShared';
import { sendInternalError } from '../../middleware/errorHandler';

const router = Router();

const pairTestSchema = z.object({
  pair: z.string().min(1, 'pair es requerido'),
});

// ── GET /api/settings/coingecko/search?symbol=XXX ────────────────────────
// Busca el mejor coingecko_id para un símbolo sin guardar nada en DB.
// Usado por AddAssetDialog como fallback cuando no hay pares Binance.
router.get('/coingecko/search', async (req: Request, res: Response) => {
  const symbol = validateSymbol((req.query.symbol as string) ?? '');
  if (!symbol) { res.status(400).json({ error: 'Símbolo inválido' }); return; }
  try {
    const { searchCoinGeckoBySymbol } = await import('../../modules/prices/coingecko');
    const result = await searchCoinGeckoBySymbol(symbol);
    if (!result) {
      res.json({ found: false });
      return;
    }
    res.json({ found: true, coingecko_id: result.id, price_eur: result.price_eur });
  } catch (err) {
    sendInternalError(res, err, '/coingecko/search', 'Error al buscar en CoinGecko');
  }
});

// ── GET /api/settings/coingecko/test?id=xxx ───────────────────────────────
// Verifica si un coingecko_id devuelve precio activo. Usado por la UI antes de guardar.
router.get('/coingecko/test', async (req: Request, res: Response) => {
  const validation = coingeckoIdSchema.safeParse(req.query.id);
  if (!validation.success) {
    sendZodError(res, validation.error);
    return;
  }
  const id = validation.data;
  try {
    const price = await verifyCoinGeckoId(id);
    res.json({ id, price_eur: price, valid: price !== null });
  } catch (err) {
    sendInternalError(res, err, '/coingecko/test', 'Error al verificar el coingecko_id');
  }
});

// ── PUT /api/settings/assets/:symbol/coingecko-id ─────────────────────────
// Guarda un coingecko_id manual y recarga el map en memoria.
router.put('/assets/:symbol/coingecko-id', async (req: Request, res: Response) => {
  const symbol = validateSymbol(req.params.symbol);
  if (!symbol) { res.status(400).json({ error: 'Símbolo inválido' }); return; }

  const validation = coingeckoIdSchema.safeParse(req.body?.coingecko_id);
  if (!validation.success) {
    sendZodError(res, validation.error);
    return;
  }
  const coingecko_id = validation.data;

  try {
    // Verificar que el ID devuelve precio antes de guardar
    const price = await verifyCoinGeckoId(coingecko_id);
    if (price === null) {
      res.status(422).json({ error: `El ID "${coingecko_id}" no devuelve precio activo en CoinGecko` });
      return;
    }

    await updateCoinGeckoId(symbol, coingecko_id);

    // También actualizar price_source a 'coingecko' si era 'unknown'
    await db.query(
      `UPDATE asset_metadata
       SET price_source = CASE WHEN price_source = 'unknown' THEN 'coingecko' ELSE price_source END,
           last_price_check = NOW()
       WHERE symbol = $1`,
      [symbol]
    );

    res.json({ symbol, coingecko_id, price_eur: price });
  } catch (err) {
    sendInternalError(res, err, '/assets/:symbol/coingecko-id', 'Error al guardar el coingecko_id');
  }
});

// ── POST /api/settings/pairs/test ─────────────────────────────────────────
router.post('/pairs/test', async (req: Request, res: Response) => {
  const validation = pairTestSchema.safeParse(req.body);
  if (!validation.success) {
    sendZodError(res, validation.error);
    return;
  }
  const result = await testPair(validation.data.pair.toUpperCase());
  res.json(result);
});

export default router;
