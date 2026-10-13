import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { MAX_LENGTH_SHORT } from '../../modules/validation/textLength';
import { DISPLAY_CURRENCIES } from '../../modules/fiat/displayCurrency';
import { sendZodError } from './settingsShared';

const router = Router();

const configSchema = z.object({
  key:   z.string().min(1, 'key es requerido').max(MAX_LENGTH_SHORT, `key no puede superar ${MAX_LENGTH_SHORT} caracteres`),
  value: z.union([z.string(), z.number(), z.boolean()], { message: 'value es requerido' }),
});

// Claves con un conjunto cerrado de valores: se valida el valor antes de
// guardarlo para que un cliente no deje la app en un estado inválido.
const restrictedValues: Record<string, z.ZodType<string>> = {
  display_currency: z.enum(DISPLAY_CURRENCIES, { message: 'display_currency debe ser EUR o USD' }),
};

// ── GET /api/settings/config ───────────────────────────────────────────────
router.get('/config', async (_req: Request, res: Response) => {
  const result = await db.query('SELECT key, value FROM app_config');
  const config: Record<string, string> = {};
  for (const row of result.rows) config[row.key] = row.value;
  res.json(config);
});

// ── PUT /api/settings/config ───────────────────────────────────────────────
router.put('/config', async (req: Request, res: Response) => {
  const validation = configSchema.safeParse(req.body);
  if (!validation.success) {
    sendZodError(res, validation.error);
    return;
  }
  const { key, value } = validation.data;
  const restricted = restrictedValues[key]?.safeParse(value);
  if (restricted && !restricted.success) {
    sendZodError(res, restricted.error);
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

export default router;
