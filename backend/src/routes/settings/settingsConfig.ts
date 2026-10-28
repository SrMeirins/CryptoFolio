import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { MAX_LENGTH_SHORT } from '../../modules/validation/textLength';
import { DISPLAY_CURRENCIES } from '../../modules/fiat/displayCurrency';
import { sendZodError } from './settingsShared';
import { VIEWS_KEY } from '../../modules/history/savedViews';
import { preferenceSchemas } from '../../modules/settings/preferences';
import { DISMISSED_KEY } from '../../modules/notifications/preferences';
import { DEFAULT_TIMEZONE, TIMEZONE_CONFIG_KEY, getTimezoneInfo, invalidateTimezoneCache, isValidTimeZone } from '../../modules/time/appTimezone';

const router = Router();

// Tamaño máximo de un valor de configuración (#369): las claves actuales usan
// valores cortos; un límite evita cargas enormes en app_config.
export const MAX_CONFIG_VALUE = 2000;
// Claves con API propia: no se escriben con el PUT genérico.
const PROTECTED_KEYS = new Set([VIEWS_KEY, DISMISSED_KEY]);

const configSchema = z.object({
  key:   z.string().min(1, 'key es requerido').max(MAX_LENGTH_SHORT, `key no puede superar ${MAX_LENGTH_SHORT} caracteres`)
    .refine(k => !PROTECTED_KEYS.has(k), 'esta clave se gestiona con su propia API'),
  value: z.union([z.string().max(MAX_CONFIG_VALUE, `value no puede superar ${MAX_CONFIG_VALUE} caracteres`), z.number(), z.boolean()], { error: 'value es requerido' }),
});

// Claves con un conjunto cerrado de valores: se valida el valor antes de
// guardarlo para que un cliente no deje la app en un estado inválido.
const restrictedValues: Record<string, z.ZodType<string>> = {
  display_currency: z.enum(DISPLAY_CURRENCIES, { error: 'display_currency debe ser EUR o USD' }),
  theme: z.enum(['dark', 'light', 'system'], { error: 'theme debe ser dark, light o system' }),
  // Zona horaria (#388): una zona IANA conocida (lista blanca) o «» para volver
  // a la de la variable APP_TIMEZONE o la de por defecto.
  [TIMEZONE_CONFIG_KEY]: z.string().refine(v => v === '' || isValidTimeZone(v), 'timezone debe ser una zona horaria IANA válida (p. ej. Europe/Madrid)'),
  // Preferencias de General (#446): umbral de polvo, privacidad al abrir y página de inicio.
  ...preferenceSchemas,
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
  if (key === TIMEZONE_CONFIG_KEY && value === '') {
    await db.query('DELETE FROM app_config WHERE key = $1', [key]);
  } else {
    await db.query(
      `INSERT INTO app_config (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, String(value)]
    );
  }
  if (key === TIMEZONE_CONFIG_KEY) invalidateTimezoneCache();
  res.json({ success: true });
});

// ── GET /api/settings/timezone ─────────────────────────────────────────────
// Zona efectiva (#388), de dónde sale (ajuste, variable o por defecto) y el
// ajuste guardado si no es válido y se ha ignorado.
router.get('/timezone', async (_req: Request, res: Response) => {
  const info = await getTimezoneInfo(db);
  res.json({ ...info, default: DEFAULT_TIMEZONE });
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
