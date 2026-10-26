import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { estadoPreparacion, getDailyPnl } from '../modules/pnl/pnlService';
import { getIntradayPnl } from '../modules/pnl/intraday';
import { getDayDetail } from '../modules/pnl/dayDetail';
import { localDateOf } from '../modules/prices/closePrices';
import { db } from '../db/client';
import { getAppTimezone } from '../modules/time/appTimezone';
import { currencySchema } from '../modules/fiat/displayCurrency';
import { sendInternalError } from '../middleware/errorHandler';

const router = Router();

// Rango máximo de la consulta (~10 años) para acotar el cálculo.
const MAX_RANGE_DAYS = 3700;

const isRealDay = (d: string) => {
  const parsed = new Date(`${d}T00:00:00.000Z`);
  return !isNaN(parsed.getTime()) && parsed.toISOString().startsWith(d);
};
const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDay);

const querySchema = z.strictObject({
  from: daySchema.optional(),
  to: daySchema.optional(),
  currency: currencySchema,
});

/**
 * Reglas del rango que dependen de «hoy» en la zona de la aplicación (#389):
 * se comprueban tras validar el formato, con la zona ya resuelta. null si es válido.
 */
export function rangeError(q: { from?: string; to?: string }, today: string): string | null {
  if (q.to && q.to > today) return 'to no puede ser futura';
  if (q.from && q.to && q.from > q.to) return 'from debe ser anterior o igual a to';
  if (q.from) {
    const end = Date.parse(`${q.to ?? today}T00:00:00Z`);
    if ((end - Date.parse(`${q.from}T00:00:00Z`)) / 86_400_000 > MAX_RANGE_DAYS) return `rango máximo ${MAX_RANGE_DAYS} días`;
  }
  return null;
}

// GET /api/v1/pnl/daily?from=YYYY-MM-DD&to=YYYY-MM-DD&currency=EUR|USD
// P&L diario por día local (zona de la aplicación, #389) y rentabilidad acumulada (TWR).
// Sin `from`: desde la primera actividad; sin `to`: hasta hoy (en vivo).
router.get('/daily', async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  const today = localDateOf(await getAppTimezone(db), Date.now());
  if (!parsed.success || rangeError(parsed.data, today)) {
    res.status(400).json({ error: 'Parámetros inválidos: from/to en formato YYYY-MM-DD, from ≤ to, sin fechas futuras y rango máximo de ~10 años' });
    return;
  }
  try {
    res.json(await getDailyPnl(parsed.data));
  } catch (e) {
    sendInternalError(res, e, 'GET /api/v1/pnl/daily');
  }
});

// GET /api/v1/pnl/preparacion (#334): ¿están todos los cierres históricos?
// Progreso por activos; mientras no esté completo, el dashboard muestra carga.
router.get('/preparacion', async (_req: Request, res: Response) => {
  try {
    res.json(await estadoPreparacion());
  } catch (e) {
    sendInternalError(res, e, 'GET /api/v1/pnl/preparacion');
  }
});

const intradaySchema = z.strictObject({ currency: currencySchema });

// GET /api/v1/pnl/intraday?currency=EUR|USD
// Evolución de las últimas 24 h cada 15 min más el instante actual (#215).
router.get('/intraday', async (req: Request, res: Response) => {
  const parsed = intradaySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Parámetros inválidos: solo se admite currency=EUR|USD' });
    return;
  }
  try {
    res.json(await getIntradayPnl(parsed.data.currency));
  } catch (e) {
    sendInternalError(res, e, 'GET /api/v1/pnl/intraday');
  }
});

const dayQuerySchema = z.strictObject({ date: daySchema, currency: currencySchema });

// GET /api/v1/pnl/day?date=YYYY-MM-DD&currency=EUR|USD
// Detalle de un día del calendario: cifras y reparto del P&L por activo (#216).
router.get('/day', async (req: Request, res: Response) => {
  const parsed = dayQuerySchema.safeParse(req.query);
  // Sin fechas futuras en la zona de la aplicación (#389).
  if (!parsed.success || parsed.data.date > localDateOf(await getAppTimezone(db), Date.now())) {
    res.status(400).json({ error: 'Parámetros inválidos: date en formato YYYY-MM-DD, no futura; currency=EUR|USD' });
    return;
  }
  try {
    const detail = await getDayDetail(parsed.data.date, parsed.data.currency);
    if (!detail) {
      res.status(404).json({ error: 'Sin actividad ese día' });
      return;
    }
    res.json(detail);
  } catch (e) {
    sendInternalError(res, e, 'GET /api/v1/pnl/day');
  }
});

export default router;
