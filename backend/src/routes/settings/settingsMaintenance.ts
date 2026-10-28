import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { runFifoEngine } from '../../modules/fifo/engine';
import { getHistoricalPriceEur } from '../../modules/prices/binance';
import { requireConfirm, sendZodError } from './settingsShared';
import { sendInternalError } from '../../middleware/errorHandler';
import { collectNotifications } from '../../modules/notifications/collect';
import { dismissWith, notificationState, readNotificationPrefs, saveDismissed, visibleNotifications } from '../../modules/notifications/preferences';

const router = Router();

const bulkSetCostsSchema = z.object({
  updates: z.array(z.object({
    id:           z.string().min(1, 'id es requerido'),
    pricePerUnit: z.number({ error: 'pricePerUnit debe ser un número' }),
  })).min(1, 'updates no puede estar vacío'),
});

// ── POST /api/settings/transactions/fix-stale-withdrawals ─────────────────
// Convierte a LOST los WITHDRAW+destination_pending=TRUE cuya operación CSV
// original era "Asset Recovery" o "Token Swap - Distribution" con change < 0.
// Binance fuerza estos retiros (delisting): no van a ninguna wallet, son pérdidas.
// La operación original sale de la fila del CSV (#374): las columnas fijas de
// raw_transactions guardan el tipo ya normalizado y nunca coincidían.
router.post('/transactions/fix-stale-withdrawals', async (_req: Request, res: Response) => {
  try {
    const result = await db.query(
      `UPDATE transactions t
       SET operation_type        = 'LOST'::operation_type,
           destination_wallet_id = NULL,
           destination_pending   = FALSE,
           notes = COALESCE(t.notes,
             (rt.original_row->>'Operation') || ' — activo retirado por Binance')
       FROM raw_transactions rt
       WHERE rt.transaction_id = t.id
         AND t.operation_type = 'WITHDRAW'
         AND t.destination_pending = TRUE
         AND t.original_import IS NULL  -- las editadas a mano no se tocan (#378)
         AND rt.original_row->>'Operation' IN ('Asset Recovery', 'Token Swap - Distribution')
         AND rt.original_row->>'Change' LIKE '-%'
       RETURNING t.id, t.asset, t.timestamp`
    );
    res.json({ fixed: result.rows.length, records: result.rows });
  } catch (err) {
    sendInternalError(res, err, '/transactions/fix-stale-withdrawals', 'Error al corregir los retiros pendientes');
  }
});

// ── DELETE /api/settings/price-cache ──────────────────────────────────────
// Destructivo de alcance amplio (borra TODO el caché de precios) — exige
// { confirm: true } en el body, ver settingsShared.ts.
router.delete('/price-cache', async (req: Request, res: Response) => {
  if (!requireConfirm(res, req.body)) return;
  const result = await db.query('DELETE FROM price_cache RETURNING id');
  res.json({ deleted: result.rows.length });
});

// ── DELETE /api/settings/price-cache/failed?asset=LUNC ────────────────────
// Elimina solo los sentinels -1 (precios fallidos) de un activo o de todos.
// Permite reintentar sin borrar los precios válidos existentes — alcance
// acotado y recuperable (se regeneran solos), sin necesidad del guard de
// confirmación que sí exige el borrado completo de arriba.
router.delete('/price-cache/failed', async (req: Request, res: Response) => {
  const { asset } = req.query;
  let result;
  if (asset && typeof asset === 'string') {
    result = await db.query(
      "DELETE FROM price_cache WHERE price_eur = -1 AND asset = $1 RETURNING id",
      [asset.toUpperCase()]
    );
  } else {
    result = await db.query("DELETE FROM price_cache WHERE price_eur = -1 RETURNING id");
  }
  res.json({ deleted: result.rows.length });
});

// ── GET /api/settings/notifications ───────────────────────────────────────
// Recopila avisos del sistema clasificados por severidad
router.get('/notifications', async (req: Request, res: Response) => {
  // Filtrados según las preferencias (#447); con ?incluir=todas, todos con sus marcas.
  const all = await collectNotifications();
  const prefs = await readNotificationPrefs(db);
  if (req.query.incluir === 'todas') {
    res.json(all.map(n => ({ ...n, ...notificationState(n, prefs) })));
    return;
  }
  res.json(visibleNotifications(all, prefs));
});

// ── POST /api/settings/notifications/dismiss ─────────────────────────────
// Descarta avisos (#447) hasta que cambie su contenido: guarda la huella de
// los indicados, o de todos los visibles si no se indica ninguno.
const dismissSchema = z.object({ ids: z.array(z.string().min(1).max(80)).max(50).optional() });
router.post('/notifications/dismiss', async (req: Request, res: Response) => {
  const validation = dismissSchema.safeParse(req.body ?? {});
  if (!validation.success) {
    sendZodError(res, validation.error);
    return;
  }
  const all = await collectNotifications();
  const prefs = await readNotificationPrefs(db);
  const ids = validation.data.ids;
  const targets = visibleNotifications(all, prefs).filter(n => !ids || ids.includes(n.id));
  await saveDismissed(db, dismissWith(prefs.dismissed, targets, all));
  res.json({ dismissed: targets.length });
});

// ── GET /api/settings/pending-deposits ───────────────────────────────────
// Transacciones de depósito externo ya importadas sin coste de adquisición
router.get('/pending-deposits', async (_req: Request, res: Response) => {
  const result = await db.query(
    `SELECT t.id, t.timestamp, t.asset, t.amount, t.price_per_unit, t.cost_amount, w.name AS wallet_name
     FROM transactions t
     JOIN wallets w ON w.id = t.wallet_id
     WHERE t.notes LIKE '%Depósito de cripto externo%'
       AND t.price_per_unit IS NULL
     ORDER BY t.timestamp`
  );
  // Auto-detectar precio histórico para cada depósito
  const rows = await Promise.all(result.rows.map(async (row: {
    id: string; timestamp: string; asset: string; amount: string;
    price_per_unit: null; cost_amount: null; wallet_name: string;
  }) => {
    let historicalPrice: number | null = null;
    try {
      historicalPrice = await getHistoricalPriceEur(row.asset, new Date(row.timestamp));
    } catch { /* sin precio */ }
    return { ...row, historicalPrice };
  }));
  res.json(rows);
});

// ── POST /api/settings/bulk-set-costs ────────────────────────────────────
// Asigna precio de adquisición a depósitos externos ya importados
router.post('/bulk-set-costs', async (req: Request, res: Response) => {
  const validation = bulkSetCostsSchema.safeParse(req.body);
  if (!validation.success) {
    sendZodError(res, validation.error);
    return;
  }
  const { updates } = validation.data;

  await db.transaction(async (client) => {
    for (const { id, pricePerUnit } of updates) {
      const amount = await client.query('SELECT amount FROM transactions WHERE id = $1', [id]);
      if (!amount.rows[0]) continue;
      const costAmount = parseFloat(amount.rows[0].amount) * pricePerUnit;
      await client.query(
        `UPDATE transactions SET price_per_unit = $1, cost_amount = $2, updated_at = NOW() WHERE id = $3`,
        [pricePerUnit, costAmount, id]
      );
    }
  });
  const fifo = await runFifoEngine();
  res.json({ success: true, updated: updates.length, fifo });
});

// ── GET /api/settings/backup ──────────────────────────────────────────────
router.get('/backup', async (_req: Request, res: Response) => {
  const [txs, walletsRes, assets, config, imports] = await Promise.all([
    db.query('SELECT * FROM transactions ORDER BY timestamp ASC'),
    db.query(`
      SELECT w.*, COALESCE(json_agg(
        json_build_object(
          'id', a.id, 'network_name', n.name, 'network_native_asset', n.native_asset,
          'custom_network', a.custom_network, 'address', a.address, 'explorer_url',
          COALESCE(a.custom_explorer_url, n.explorer_url)
        )
      ) FILTER (WHERE a.id IS NOT NULL), '[]') AS addresses
      FROM wallets w
      LEFT JOIN wallet_addresses a ON a.wallet_id = w.id
      LEFT JOIN networks n ON n.id = a.network_id
      GROUP BY w.id ORDER BY w.created_at
    `),
    db.query('SELECT * FROM asset_metadata ORDER BY symbol'),
    db.query('SELECT * FROM app_config'),
    db.query('SELECT id, filename, imported_at, row_count, skipped_count FROM csv_imports ORDER BY imported_at'),
  ]);
  res.json({
    version:      '1.0',
    exported_at:  new Date().toISOString(),
    transactions: txs.rows,
    wallets:      walletsRes.rows,
    assets:       assets.rows,
    config:       config.rows,
    imports:      imports.rows,
  });
});

// ── DELETE /api/settings/data/transactions ────────────────────────────────
// Elimina todas las transacciones, lotes FIFO e importaciones.
// La configuración (wallets, activos, app_config) se conserva.
// Destructivo de alcance total — exige { confirm: true } en el body.
router.delete('/data/transactions', async (req: Request, res: Response) => {
  if (!requireConfirm(res, req.body)) return;
  await db.transaction(async (client) => {
    await client.query('DELETE FROM fifo_lot_consumptions');
    await client.query('DELETE FROM fifo_lots');
    await client.query('DELETE FROM raw_transactions');
    await client.query('DELETE FROM transactions');
    await client.query('DELETE FROM csv_imports');
    await client.query('DELETE FROM price_cache');
  });
  res.json({ success: true });
});

export default router;
