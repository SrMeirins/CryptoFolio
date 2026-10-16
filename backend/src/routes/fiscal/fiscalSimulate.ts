import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { sendZodError } from './fiscalShared';
import { validateSymbol } from '../settings/settingsShared';
import { cantidadParaNeto, cargarContextoVenta, curvaVenta, evaluarVenta, type ContextoVenta } from '../../modules/fiscal/simulacionVenta';

const router = Router();

// Campos comunes: activo, wallet donde se vende (#279: el motor fiscal aplica
// FIFO por wallet; sin ella, la de mayor cantidad) y comisión de venta en %.
const base = {
  asset:    z.string().min(1, 'asset es requerido'),
  walletId: z.string().uuid('walletId inválido').optional(),
  feePct:   z.number().min(0).max(10, 'feePct debe estar entre 0 y 10').optional(),
};

const simulateSaleSchema = z.object({
  ...base,
  quantity: z.number().positive('quantity debe ser un número mayor que 0'),
  priceEur: z.number().nonnegative('priceEur debe ser un número mayor o igual que 0'),
});

const curveSchema = z.object({
  ...base,
  quantity: z.number().positive('quantity debe ser un número mayor que 0'),
  prices:   z.array(z.number().nonnegative()).min(2).max(101, 'como máximo 101 precios'),
});

const quantitySchema = z.object({
  ...base,
  priceEur:  z.number().positive('priceEur debe ser mayor que 0'),
  targetNet: z.number().positive('targetNet debe ser mayor que 0'),
});

/** Valida el símbolo y carga el contexto de la venta; responde el error si lo hay. */
async function contexto(res: Response, rawAsset: string, walletId?: string): Promise<ContextoVenta | null> {
  const asset = validateSymbol(rawAsset);
  if (!asset) { res.status(400).json({ error: 'Símbolo inválido' }); return null; }
  const ctx = await cargarContextoVenta(asset, walletId);
  if ('error' in ctx) { res.status(ctx.status).json({ error: ctx.error }); return null; }
  return ctx;
}

// ── POST /api/fiscal/simulate-sale ────────────────────────────────────────
// Simulación pura: no escribe nada en DB. Impacto fiscal de una venta
// hipotética en una wallet, con IRPF marginal y aviso de recompra.
router.post('/simulate-sale', async (req: Request, res: Response) => {
  const v = simulateSaleSchema.safeParse(req.body);
  if (!v.success) { sendZodError(res, v.error); return; }
  const ctx = await contexto(res, v.data.asset, v.data.walletId);
  if (!ctx) return;
  const { quantity, priceEur, feePct = 0 } = v.data;
  if (quantity > ctx.wallet.quantity + 0.0001) {
    res.status(400).json({ error: `Solo hay ${ctx.wallet.quantity.toFixed(6)} ${ctx.asset} en ${ctx.wallet.walletName}` });
    return;
  }
  const e = evaluarVenta(ctx, quantity, priceEur, feePct);

  // Regla de recompra (art. 33.5 LIRPF): compras reales del activo en los 2
  // meses anteriores. Solo se avisa (como en Fiscal), sin cambiar el cálculo.
  const recompraRes = e.netGainLoss < 0
    ? await db.query(
        `SELECT DISTINCT fl.opened_at::date AS fecha
         FROM fifo_lots fl JOIN transactions t ON t.id = fl.open_transaction_id
         WHERE fl.asset = $1
           AND t.operation_type NOT IN ('TRANSFER_INTERNAL', 'WITHDRAW', 'DEPOSIT_CRYPTO', 'MARGIN_BORROW')
           AND fl.opened_at >= NOW() - INTERVAL '2 months'
         ORDER BY fecha DESC`,
        [ctx.asset],
      )
    : { rows: [] };
  const comprasRecientes = (recompraRes.rows as Array<{ fecha: string | Date }>)
    .map(r => (r.fecha instanceof Date ? r.fecha.toISOString() : String(r.fecha)).slice(0, 10));

  res.json({
    asset: ctx.asset,
    quantity,
    priceEur,
    feePct,
    walletId: ctx.wallet.walletId,
    wallets: ctx.wallets,
    ...e,
    irpfEstimate: e.irpf.marginal,
    recompra: { aviso: comprasRecientes.length > 0, comprasRecientes },
  });
});

// ── POST /api/fiscal/simulate-sale/curve ──────────────────────────────────
// Resultado neto (tras comisión e IRPF) de vender `quantity` a cada precio
// (#280): alimenta el gráfico del simulador con la misma regla fiscal.
router.post('/simulate-sale/curve', async (req: Request, res: Response) => {
  const v = curveSchema.safeParse(req.body);
  if (!v.success) { sendZodError(res, v.error); return; }
  const ctx = await contexto(res, v.data.asset, v.data.walletId);
  if (!ctx) return;
  const quantity = Math.min(v.data.quantity, ctx.wallet.quantity);
  res.json({ asset: ctx.asset, walletId: ctx.wallet.walletId, quantity, points: curvaVenta(ctx, quantity, v.data.feePct ?? 0, v.data.prices) });
});

// ── POST /api/fiscal/simulate-sale/quantity ───────────────────────────────
// Cantidad a vender para recibir un neto en mano (#280).
router.post('/simulate-sale/quantity', async (req: Request, res: Response) => {
  const v = quantitySchema.safeParse(req.body);
  if (!v.success) { sendZodError(res, v.error); return; }
  const ctx = await contexto(res, v.data.asset, v.data.walletId);
  if (!ctx) return;
  res.json({ asset: ctx.asset, walletId: ctx.wallet.walletId, ...cantidadParaNeto(ctx, v.data.priceEur, v.data.feePct ?? 0, v.data.targetNet) });
});

export default router;
