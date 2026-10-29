import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import { validateSymbol } from './settings/settingsShared';
import { sendInternalError } from '../middleware/errorHandler';
import { getAppTimezone } from '../modules/time/appTimezone';

// Cierres diarios (hora de Madrid) de varios activos en una sola consulta
// (#282): alimentan los mini-gráficos de 7 días de la tabla de Portfolio.
const router = Router();

const MAX_ASSETS = 100;
const querySchema = z.strictObject({
  assets: z.string().min(1).max(1200),
  days:   z.coerce.number().int().min(2).max(400).default(7),
});

// GET /api/v1/prices/closes?assets=BTC,XRP&days=7
router.get('/closes', async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Parámetros inválidos: assets (lista separada por comas) y days entre 2 y 400' });
    return;
  }
  const assets = [...new Set(parsed.data.assets.split(',').map(a => validateSymbol(a)))];
  if (assets.some(a => a === null) || assets.length > MAX_ASSETS) {
    res.status(400).json({ error: `Símbolos inválidos o más de ${MAX_ASSETS} activos` });
    return;
  }
  try {
    const result = await db.query(
      `SELECT asset, close_date::text AS date, price_eur::float AS price
       FROM price_close_daily
       WHERE asset = ANY($1::text[]) AND timezone = $3
         AND close_date >= (NOW() AT TIME ZONE $3)::date - ($2::int - 1)
         AND price_eur > 0
       ORDER BY asset, close_date`,
      [assets, parsed.data.days, await getAppTimezone(db)],
    );
    const closes: Record<string, Array<{ date: string; price: number }>> = {};
    for (const a of assets as string[]) closes[a] = [];
    for (const r of result.rows as Array<{ asset: string; date: string; price: number }>) {
      closes[r.asset].push({ date: r.date, price: r.price });
    }
    res.json({ days: parsed.data.days, closes });
  } catch (e) {
    sendInternalError(res, e, 'GET /api/v1/prices/closes');
  }
});

export default router;
