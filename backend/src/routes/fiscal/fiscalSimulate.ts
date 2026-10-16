import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { calcularIrpfAhorro, desgloseMarginal, parseTiposConfig } from '../../modules/fiscal/irpf';
import { baseAhorro, cargarAniosFiscales, compensarPerdidas } from '../../modules/fiscal/carryforward';
import { consumirFifo, type LoteAbierto } from '../../modules/fiscal/simularVenta';
import { db } from '../../db/client';
import { sendZodError } from './fiscalShared';
import { validateSymbol } from '../settings/settingsShared';

const router = Router();

const simulateSaleSchema = z.object({
  asset:    z.string().min(1, 'asset es requerido'),
  quantity: z.number().positive('quantity debe ser un número mayor que 0'),
  priceEur: z.number().nonnegative('priceEur debe ser un número mayor o igual que 0'),
  // Wallet donde se vende (#279): el motor fiscal aplica FIFO por wallet. Sin
  // ella, la de mayor cantidad del activo.
  walletId: z.string().uuid('walletId inválido').optional(),
  // Comisión de venta en % (#279): reduce el valor de transmisión.
  feePct:   z.number().min(0).max(10, 'feePct debe estar entre 0 y 10').optional(),
});

// ── POST /api/fiscal/simulate-sale ────────────────────────────────────────
// Simulación pura: no escribe nada en DB. Devuelve el impacto fiscal de una
// venta hipotética en una wallet, con el IRPF marginal sobre la base del
// ejercicio y el aviso de la regla de recompra.
router.post('/simulate-sale', async (req: Request, res: Response) => {
  const validation = simulateSaleSchema.safeParse(req.body);
  if (!validation.success) {
    sendZodError(res, validation.error);
    return;
  }
  const asset = validateSymbol(validation.data.asset);
  if (!asset) { res.status(400).json({ error: 'Símbolo inválido' }); return; }
  const { quantity, priceEur, feePct = 0 } = validation.data;

  // Wallets con el activo, de mayor a menor cantidad.
  const walletsRes = await db.query(
    `SELECT fl.wallet_id, w.name AS wallet_name, SUM(fl.quantity_remaining)::float AS quantity
     FROM fifo_lots fl JOIN wallets w ON w.id = fl.wallet_id
     WHERE fl.asset = $1 AND fl.is_closed = FALSE AND fl.quantity_remaining > 0.0000001
     GROUP BY fl.wallet_id, w.name
     ORDER BY quantity DESC, w.name`,
    [asset],
  );
  const wallets = (walletsRes.rows as Array<{ wallet_id: string; wallet_name: string; quantity: number }>)
    .map(w => ({ walletId: w.wallet_id, walletName: w.wallet_name, quantity: w.quantity }));
  if (wallets.length === 0) {
    res.status(404).json({ error: `No hay lotes abiertos para ${asset}` });
    return;
  }
  const wallet = validation.data.walletId ? wallets.find(w => w.walletId === validation.data.walletId) : wallets[0];
  if (!wallet) {
    res.status(404).json({ error: `No hay lotes abiertos de ${asset} en esa wallet` });
    return;
  }
  if (quantity > wallet.quantity + 0.0001) {
    res.status(400).json({ error: `Solo hay ${wallet.quantity.toFixed(6)} ${asset} en ${wallet.walletName}` });
    return;
  }

  // Lotes de esa wallet en el orden del motor FIFO.
  const lotsRes = await db.query(
    `SELECT fl.id, fl.quantity_remaining::float AS quantity, fl.cost_basis_eur::float AS cost_basis,
            fl.price_per_unit_eur::float AS price_per_unit, fl.opened_at, w.name AS wallet_name
     FROM fifo_lots fl JOIN wallets w ON w.id = fl.wallet_id
     WHERE fl.asset = $1 AND fl.wallet_id = $2 AND fl.is_closed = FALSE AND fl.quantity_remaining > 0.0000001
     ORDER BY fl.opened_at ASC, fl.created_at ASC`,
    [asset, wallet.walletId],
  );
  const lotes: LoteAbierto[] = (lotsRes.rows as Array<Record<string, unknown>>).map(r => ({
    id: r.id as string,
    walletName: r.wallet_name as string,
    openedAt: new Date(r.opened_at as string).toISOString().slice(0, 10),
    quantity: r.quantity as number,
    costBasis: r.cost_basis as number,
    pricePerUnit: r.price_per_unit as number,
  }));
  const consumo = consumirFifo(lotes, quantity, priceEur, feePct);

  // IRPF marginal (#279): base del ahorro del ejercicio, con la misma regla de
  // compensación de pérdidas que Fiscal, sin y con esta venta.
  const year = new Date().getFullYear();
  const anios = await cargarAniosFiscales(year);
  const conVenta = anios.map(a => (a.year === year ? { ...a, netoGP: a.netoGP + consumo.netGainLoss } : a));
  const baseAntes = baseAhorro(compensarPerdidas(anios).detalle.at(-1)!);
  const baseDespues = baseAhorro(compensarPerdidas(conVenta).detalle.at(-1)!);
  const tipos = parseTiposConfig((await db.query("SELECT value FROM app_config WHERE key = 'irpf_tramos_tipos'")).rows[0]?.value);
  const irpfMarginal = Math.round((calcularIrpfAhorro(Math.max(0, baseDespues), tipos) - calcularIrpfAhorro(Math.max(0, baseAntes), tipos)) * 100) / 100;

  // Regla de recompra (art. 33.5 LIRPF): compras reales del activo en los 2
  // meses anteriores. Solo se avisa (como en Fiscal), sin cambiar el cálculo.
  const recompraRes = consumo.netGainLoss < 0
    ? await db.query(
        `SELECT DISTINCT fl.opened_at::date AS fecha
         FROM fifo_lots fl JOIN transactions t ON t.id = fl.open_transaction_id
         WHERE fl.asset = $1
           AND t.operation_type NOT IN ('TRANSFER_INTERNAL', 'WITHDRAW', 'DEPOSIT_CRYPTO', 'MARGIN_BORROW')
           AND fl.opened_at >= NOW() - INTERVAL '2 months'
         ORDER BY fecha DESC`,
        [asset],
      )
    : { rows: [] };
  const comprasRecientes = (recompraRes.rows as Array<{ fecha: string | Date }>)
    .map(r => (r.fecha instanceof Date ? r.fecha.toISOString() : String(r.fecha)).slice(0, 10));

  res.json({
    asset,
    quantity,
    priceEur,
    feePct,
    walletId: wallet.walletId,
    wallets,
    ...consumo,
    irpfEstimate: irpfMarginal,
    irpf: {
      year,
      baseAntes,
      baseDespues,
      marginal: irpfMarginal,
      desglose: desgloseMarginal(Math.max(0, baseAntes), Math.max(0, baseDespues), tipos),
    },
    recompra: { aviso: comprasRecientes.length > 0, comprasRecientes },
  });
});

export default router;
