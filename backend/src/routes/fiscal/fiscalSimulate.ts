import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { calcularIrpfAhorro, parseTiposConfig } from '../../modules/fiscal/irpf';
import { db } from '../../db/client';
import { sendZodError } from './fiscalShared';

const router = Router();

// Schema equivalente a la validación manual `typeof` que sustituye.
const simulateSaleSchema = z.object({
  asset:    z.string().min(1, 'asset es requerido'),
  quantity: z.number().positive('quantity debe ser un número mayor que 0'),
  priceEur: z.number().nonnegative('priceEur debe ser un número mayor o igual que 0'),
});

// ── POST /api/fiscal/simulate-sale ────────────────────────────────────────
// Simulación pura FIFO: no escribe nada en DB. Devuelve impacto fiscal de una
// venta hipotética. Usa los lotes abiertos ordenados FIFO (oldest first).
router.post('/simulate-sale', async (req: Request, res: Response) => {
  const validation = simulateSaleSchema.safeParse(req.body);
  if (!validation.success) {
    sendZodError(res, validation.error);
    return;
  }
  const { asset, quantity, priceEur } = validation.data;

  const lotsRes = await db.query(
    `SELECT
       fl.id,
       fl.asset,
       fl.quantity_remaining::float AS quantity_remaining,
       fl.cost_basis_eur::float     AS cost_basis_eur,
       fl.price_per_unit_eur::float AS price_per_unit_eur,
       fl.opened_at,
       w.name AS wallet_name
     FROM fifo_lots fl
     JOIN wallets w ON w.id = fl.wallet_id
     WHERE fl.asset = $1
       AND fl.is_closed = FALSE
       AND fl.quantity_remaining > 0.0000001
     ORDER BY fl.opened_at ASC, fl.id ASC`,
    [asset.toUpperCase()]
  );

  if (lotsRes.rows.length === 0) {
    res.status(404).json({ error: `No hay lotes abiertos para ${asset}` });
    return;
  }

  const totalAvailable = lotsRes.rows.reduce((s: number, r: Record<string, number>) => s + r.quantity_remaining, 0);
  if (quantity > totalAvailable + 0.0001) {
    res.status(400).json({ error: `Solo hay ${totalAvailable.toFixed(6)} ${asset} disponibles` });
    return;
  }

  // Simular consumo FIFO
  let remaining = quantity;
  let totalProceeds  = 0;
  let totalCostBasis = 0;
  let totalGain = 0;
  let totalLoss = 0;

  const lotsConsumed: {
    lotId:        string;
    walletName:   string;
    openedAt:     string;
    qtyAvailable: number;
    qtyConsumed:  number;
    costBasisConsumed: number;
    pricePerUnit: number;
    proceedsEur:  number;
    gainLossEur:  number;
  }[] = [];

  for (const row of lotsRes.rows as Record<string, unknown>[]) {
    if (remaining <= 0.0000001) break;

    const lotQty   = row.quantity_remaining as number;
    const costBasis = row.cost_basis_eur as number;
    const consumed  = Math.min(lotQty, remaining);
    const proportion = consumed / lotQty;
    const costConsumed = costBasis * proportion;
    const proceeds    = consumed * priceEur;
    const gainLoss    = proceeds - costConsumed;

    totalProceeds  += proceeds;
    totalCostBasis += costConsumed;
    if (gainLoss >= 0) totalGain += gainLoss;
    else               totalLoss += gainLoss;

    lotsConsumed.push({
      lotId:             row.id as string,
      walletName:        row.wallet_name as string,
      openedAt:          new Date(row.opened_at as string).toISOString().slice(0, 10),
      qtyAvailable:      lotQty,
      qtyConsumed:       consumed,
      costBasisConsumed: costConsumed,
      pricePerUnit:      row.price_per_unit_eur as number,
      proceedsEur:       proceeds,
      gainLossEur:       gainLoss,
    });

    remaining -= consumed;
  }

  const netGainLoss = totalGain + totalLoss;

  // Estimación IRPF (solo sobre ganancias netas; no considera otras rentas del año).
  // Lee los porcentajes de Ajustes → Fiscal, misma fuente que el frontend.
  const tiposRes = await db.query("SELECT value FROM app_config WHERE key = 'irpf_tramos_tipos'");
  const irpfEstimate = netGainLoss > 0
    ? calcularIrpfAhorro(netGainLoss, parseTiposConfig(tiposRes.rows[0]?.value))
    : 0;

  res.json({
    asset:         asset.toUpperCase(),
    quantity,
    priceEur,
    totalProceeds,
    totalCostBasis,
    totalGain,
    totalLoss,
    netGainLoss,
    irpfEstimate,
    lotsConsumed,
  });
});

export default router;
