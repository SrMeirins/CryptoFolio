import { Router } from 'express';
import { db } from '../../db/client';
import { FIFO_DUST_EPSILON } from '../../modules/fifo/constants';
import { validateSymbol } from '../settings/settingsShared';
import { sendInternalError } from '../../middleware/errorHandler';

// Lotes FIFO abiertos de un activo (#272), para el panel de detalle de
// Portfolio. /api/fifo/lots los devuelve agregados por activo y wallet; aquí
// van uno a uno, en el mismo orden en que el motor los consumiría (FIFO global
// por activo, #476: el más antiguo primero, esté en la wallet que esté) y con
// el mismo umbral de polvo. Un lote reubicado por una transmisión en otra
// wallet se marca como tal en lugar de mostrar el tipo de esa operación.
const router = Router();

// GET /api/v1/fifo/lots/:asset
router.get('/lots/:asset', async (req, res) => {
  const asset = validateSymbol(String(req.params.asset));
  if (!asset) {
    res.status(400).json({ error: 'Símbolo inválido' });
    return;
  }
  try {
    const result = await db.query(
      `SELECT
         fl.wallet_id,
         w.name  AS wallet_name,
         w.color AS wallet_color,
         w.type  AS wallet_kind,
         fl.opened_at,
         fl.quantity_original,
         fl.quantity_remaining,
         fl.price_per_unit_eur,
         fl.cost_basis_eur,
         fl.usd_per_eur,
         CASE
           WHEN t.operation_type IN ('WITHDRAW', 'TRANSFER_INTERNAL') THEN t.operation_type::text
           WHEN EXISTS (
             SELECT 1 FROM fifo_lot_consumptions c JOIN fifo_lots sl ON sl.id = c.lot_id
             WHERE c.consuming_transaction_id = fl.open_transaction_id AND c.fiscal_event_type = 'NONE'
               AND sl.asset = fl.asset AND sl.opened_at = fl.opened_at AND sl.wallet_id <> fl.wallet_id
           ) THEN 'REUBICACION'
           ELSE t.operation_type::text
         END AS source_type
       FROM fifo_lots fl
       JOIN wallets w      ON w.id = fl.wallet_id
       JOIN transactions t ON t.id = fl.open_transaction_id
       WHERE fl.asset = $1
         AND fl.is_closed = FALSE
         AND fl.quantity_remaining > $2
       ORDER BY fl.opened_at ASC, fl.created_at ASC`,
      [asset, FIFO_DUST_EPSILON],
    );
    res.json({ asset, lots: result.rows });
  } catch (e) {
    sendInternalError(res, e, 'GET /api/v1/fifo/lots/:asset');
  }
});

export default router;
