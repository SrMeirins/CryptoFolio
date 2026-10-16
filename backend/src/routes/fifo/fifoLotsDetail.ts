import { Router } from 'express';
import { db } from '../../db/client';
import { FIFO_DUST_EPSILON } from '../../modules/fifo/constants';
import { validateSymbol } from '../settings/settingsShared';
import { sendInternalError } from '../../middleware/errorHandler';

// Lotes FIFO abiertos de un activo (#272), para el panel de detalle de
// Portfolio. /api/fifo/lots los devuelve agregados por activo y wallet; aquí
// van uno a uno, en el mismo orden en que el motor los consumiría (por
// wallet: el más antiguo primero) y con el mismo umbral de polvo.
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
         t.operation_type::text AS source_type
       FROM fifo_lots fl
       JOIN wallets w      ON w.id = fl.wallet_id
       JOIN transactions t ON t.id = fl.open_transaction_id
       WHERE fl.asset = $1
         AND fl.is_closed = FALSE
         AND fl.quantity_remaining > $2
       ORDER BY w.name, fl.opened_at ASC, fl.created_at ASC`,
      [asset, FIFO_DUST_EPSILON],
    );
    res.json({ asset, lots: result.rows });
  } catch (e) {
    sendInternalError(res, e, 'GET /api/v1/fifo/lots/:asset');
  }
});

export default router;
