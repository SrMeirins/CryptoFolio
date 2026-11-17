import { Router } from 'express';
import { db } from '../../db/client';
import { FIFO_DUST_EPSILON } from '../../modules/fifo/constants';
import { validateSymbol } from '../settings/settingsShared';
import { sendInternalError } from '../../middleware/errorHandler';

// Ventas y permutas de un activo (#284), para el gráfico y la rentabilidad
// total del panel de detalle. Los consumos FIFO se agrupan por operación: una
// venta que consume varios lotes cuenta como una sola. El realizado usa el
// mismo filtro que /api/fifo/realized-pnl (todo consumo con efecto fiscal),
// para que coincida con Fiscal; la lista y el recuento solo incluyen ventas
// (SELL) y permutas (BUY de otro activo pagado con este). Comisiones pagadas
// con el activo, devoluciones de margen o pérdidas suman al realizado aparte.
const SALE_KINDS: Readonly<Record<string, 'venta' | 'permuta'>> = { SELL: 'venta', BUY: 'permuta' };
const router = Router();

interface SaleRow {
  transaction_id: string;
  sold_at: string;
  operation_type: string;
  quantity: string;
  proceeds_eur: string;
  gain_loss_eur: string;
}

// GET /api/v1/fifo/sales/:asset
router.get('/sales/:asset', async (req, res) => {
  const asset = validateSymbol(String(req.params.asset));
  if (!asset) {
    res.status(400).json({ error: 'Símbolo inválido' });
    return;
  }
  try {
    const result = await db.query<SaleRow>(
      `SELECT
         flc.consuming_transaction_id AS transaction_id,
         MIN(flc.consumed_at)         AS sold_at,
         t.operation_type::text       AS operation_type,
         SUM(flc.quantity_consumed)   AS quantity,
         SUM(flc.proceeds_eur)        AS proceeds_eur,
         SUM(flc.gain_loss_eur)       AS gain_loss_eur
       FROM fifo_lot_consumptions flc
       JOIN fifo_lots fl   ON fl.id = flc.lot_id
       JOIN transactions t ON t.id = flc.consuming_transaction_id
       WHERE fl.asset = $1
         AND flc.fiscal_event_type != 'NONE'
       GROUP BY flc.consuming_transaction_id, t.operation_type
       ORDER BY sold_at ASC`,
      [asset],
    );
    // Primera adquisición del activo, con lotes ya cerrados incluidos (#523): el
    // rango «Todo» del gráfico empieza ahí y muestra todas sus ventas.
    const first = await db.query<{ first: Date | null }>(`SELECT MIN(opened_at) AS first FROM fifo_lots WHERE asset = $1`, [asset]);
    // Compras ya vendidas del todo (#528), para dibujarlas huecas en el gráfico.
    // Un traspaso abre en destino un lote con la misma fecha que el original, así
    // que se agrupa por fecha de apertura: la compra está cerrada si ninguno de
    // sus lotes sigue abierto (con el mismo umbral de polvo que /lots/:asset).
    const closed = await db.query<{ opened_at: Date; quantity: string; price_eur: string }>(
      `SELECT opened_at, MAX(quantity_original) AS quantity, MAX(price_per_unit_eur) AS price_eur
       FROM fifo_lots
       WHERE asset = $1
       GROUP BY opened_at
       HAVING BOOL_AND(is_closed OR quantity_remaining <= $2)
       ORDER BY opened_at ASC`,
      [asset, FIFO_DUST_EPSILON],
    );
    const round2 = (n: number) => Math.round(n * 100) / 100;
    let realized = 0;
    let other = 0;
    const sales = [];
    for (const r of result.rows) {
      const gainLossEur = parseFloat(r.gain_loss_eur);
      realized += gainLossEur;
      const kind = SALE_KINDS[r.operation_type];
      if (!kind) { other += gainLossEur; continue; }
      const quantity = parseFloat(r.quantity);
      const proceeds = parseFloat(r.proceeds_eur);
      sales.push({
        txId: r.transaction_id,
        soldAt: new Date(r.sold_at).toISOString(),
        kind,
        quantity,
        priceEur: quantity > 0 ? proceeds / quantity : 0,
        proceedsEur: proceeds,
        gainLossEur,
      });
    }
    res.json({
      asset,
      count: sales.length,
      realizedEur: round2(realized),
      otherRealizedEur: round2(other),
      lastSaleAt: sales.at(-1)?.soldAt ?? null,
      firstAcquiredAt: first.rows[0]?.first ? new Date(first.rows[0].first).toISOString() : null,
      sales,
      closedBuys: closed.rows.map(r => ({
        openedAt: new Date(r.opened_at).toISOString(),
        quantity: parseFloat(r.quantity),
        priceEur: parseFloat(r.price_eur),
      })),
    });
  } catch (e) {
    sendInternalError(res, e, 'GET /api/v1/fifo/sales/:asset');
  }
});

export default router;
