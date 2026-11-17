import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { sendInternalError } from '../../middleware/errorHandler';
import { sendZodError } from '../../modules/validation/zodErrors';
import { getHistoricalPriceEur } from '../../modules/prices/binance';
import { requestLivePriceResync } from '../../modules/prices/liveFeed';
import { cargarContextoVenta } from '../../modules/fiscal/simulacionVenta';
import { consumirFifo } from '../../modules/fiscal/simularVenta';
import { respondWithFifoRecalc } from './transactionsShared';

// Conversión de restos (#530): varios saldos residuales de una misma wallet se
// convierten en otro activo (p. ej. «Convertir a BNB» de Binance). Se
// registra igual que la importación de Binance («Small Assets Exchange»): una
// permuta por resto, compra del activo recibido pagando con el resto, con lo
// recibido ya neto de comisión. Todas se escriben en una transacción SQL y el
// FIFO se recalcula una sola vez. La vista previa estima el resultado fiscal
// de cada resto con el mismo consumo FIFO global que el simulador.

const router = Router();
const SYMBOL = /^[A-Z0-9]{1,20}$/;
const symbol = z.string().trim().toUpperCase().regex(SYMBOL, 'símbolo de activo no válido');
const positivo = z.coerce.number().finite().positive('debe ser mayor que 0').max(1e15);

export const conversionSchema = z.object({
  walletId: z.uuid({ error: 'walletId debe ser un UUID válido' }),
  timestamp: z.iso.datetime({ offset: true, error: 'timestamp debe ser una fecha ISO 8601 con zona' }),
  recibido: symbol,
  items: z.array(z.object({ asset: symbol, cantidad: positivo, recibido: positivo })).min(1, 'al menos un resto').max(50, 'como mucho 50 restos'),
}).superRefine((v, ctx) => {
  const assets = v.items.map(i => i.asset);
  if (new Set(assets).size !== assets.length) ctx.addIssue({ code: 'custom', path: ['items'], message: 'un activo aparece más de una vez' });
  if (assets.includes(v.recibido)) ctx.addIssue({ code: 'custom', path: ['recibido'], message: 'el activo recibido no puede ser uno de los restos' });
  if (new Date(v.timestamp) > new Date(Date.now() + 5 * 60_000)) ctx.addIssue({ code: 'custom', path: ['timestamp'], message: 'la fecha no puede ser futura' });
});

type Conversion = z.infer<typeof conversionSchema>;

/** Comprueba que la wallet existe y que tiene cada resto en la cantidad indicada; devuelve el error o null. */
async function validarSaldos(v: Conversion): Promise<string | null> {
  const w = await db.query(`SELECT id FROM wallets WHERE id = $1`, [v.walletId]);
  if (w.rows.length === 0) return 'La wallet no existe';
  const saldos = await db.query<{ asset: string; qty: string }>(
    `SELECT asset, SUM(quantity_remaining) AS qty FROM fifo_lots
     WHERE wallet_id = $1 AND is_closed = FALSE AND asset = ANY($2::text[]) GROUP BY asset`,
    [v.walletId, v.items.map(i => i.asset)],
  );
  const porActivo = new Map(saldos.rows.map(r => [r.asset, parseFloat(r.qty)]));
  for (const i of v.items) {
    const disponible = porActivo.get(i.asset) ?? 0;
    if (i.cantidad > disponible * (1 + 1e-9) + 1e-12) return `Solo hay ${disponible} ${i.asset} en esa wallet`;
  }
  return null;
}

// POST /api/v1/transactions/conversion-restos/preview
router.post('/conversion-restos/preview', async (req: Request, res: Response) => {
  const v = conversionSchema.safeParse(req.body);
  if (!v.success) { sendZodError(res, v.error); return; }
  try {
    const error = await validarSaldos(v.data);
    if (error) { res.status(400).json({ error }); return; }
    let precio: number | null = null;
    try { precio = await getHistoricalPriceEur(v.data.recibido, new Date(v.data.timestamp)); } catch { precio = null; }
    const items = [];
    for (const i of v.data.items) {
      const proceedsEur = precio !== null && precio > 0 ? i.recibido * precio : null;
      const ctx = await cargarContextoVenta(i.asset, v.data.walletId);
      if ('status' in ctx || proceedsEur === null) {
        items.push({ asset: i.asset, cantidad: i.cantidad, recibido: i.recibido, proceedsEur, costEur: null, gainLossEur: null });
        continue;
      }
      // Mismo consumo FIFO global que el simulador, al precio implícito de la permuta.
      const c = consumirFifo(ctx.lotes, i.cantidad, proceedsEur / i.cantidad, 0);
      items.push({ asset: i.asset, cantidad: i.cantidad, recibido: i.recibido, proceedsEur, costEur: c.totalCostBasis, gainLossEur: c.netGainLoss });
    }
    const conResultado = items.filter(i => i.gainLossEur !== null);
    res.json({
      recibido: v.data.recibido,
      precioRecibidoEur: precio,
      items,
      totalGainLossEur: conResultado.length === items.length ? Math.round(conResultado.reduce((s, i) => s + (i.gainLossEur ?? 0), 0) * 100) / 100 : null,
    });
  } catch (e) {
    sendInternalError(res, e, 'POST /api/v1/transactions/conversion-restos/preview');
  }
});

// POST /api/v1/transactions/conversion-restos
router.post('/conversion-restos', async (req: Request, res: Response) => {
  const v = conversionSchema.safeParse(req.body);
  if (!v.success) { sendZodError(res, v.error); return; }
  try {
    const error = await validarSaldos(v.data);
    if (error) { res.status(400).json({ error }); return; }
    const { walletId, timestamp, recibido, items } = v.data;
    await db.transaction(async client => {
      for (const i of items) {
        await client.query(
          `INSERT INTO transactions (
             operation_type, timestamp, asset, amount, amount_net,
             cost_asset, cost_amount, price_per_unit,
             wallet_id, account, notes, manually_added
           ) VALUES ('BUY', $1, $2, $3, $3, $4, $5, $6, $7, 'Manual', $8, TRUE)`,
          [new Date(timestamp), recibido, i.recibido, i.asset, i.cantidad, i.cantidad / i.recibido, walletId,
            `Conversión de restos: ${i.asset} a ${recibido}`],
        );
      }
    });
    requestLivePriceResync();
    await respondWithFifoRecalc(res, 'POST /api/v1/transactions/conversion-restos');
  } catch (e) {
    sendInternalError(res, e, 'POST /api/v1/transactions/conversion-restos');
  }
});

export default router;
