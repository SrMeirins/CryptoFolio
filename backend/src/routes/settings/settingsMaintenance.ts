import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { runFifoEngine } from '../../modules/fifo/engine';
import { getHistoricalPriceEur } from '../../modules/prices/binance';
import { requireConfirm, sendZodError } from './settingsShared';
import { sendInternalError } from '../../middleware/errorHandler';

const router = Router();

const bulkSetCostsSchema = z.object({
  updates: z.array(z.object({
    id:           z.string().min(1, 'id es requerido'),
    pricePerUnit: z.number({ message: 'pricePerUnit debe ser un número' }),
  })).min(1, 'updates no puede estar vacío'),
});

// ── POST /api/settings/transactions/fix-stale-withdrawals ─────────────────
// Convierte a LOST los WITHDRAW+destination_pending=TRUE cuya operación CSV
// original era "Asset Recovery" o "Token Swap - Distribution" con change < 0.
// Binance fuerza estos retiros (delisting): no van a ninguna wallet, son pérdidas.
router.post('/transactions/fix-stale-withdrawals', async (_req: Request, res: Response) => {
  try {
    const result = await db.query(
      `UPDATE transactions t
       SET operation_type        = 'LOST'::operation_type,
           destination_wallet_id = NULL,
           destination_pending   = FALSE,
           notes = COALESCE(t.notes,
             rt.operation || ' — activo retirado por Binance')
       FROM raw_transactions rt
       WHERE rt.transaction_id = t.id
         AND t.operation_type = 'WITHDRAW'
         AND t.destination_pending = TRUE
         AND rt.operation IN ('Asset Recovery', 'Token Swap - Distribution')
         AND rt.change < 0
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
router.get('/notifications', async (_req: Request, res: Response) => {
  const notifications: Array<{
    id: string; type: 'error' | 'warning' | 'info'; category: string; message: string; count?: number;
  }> = [];

  // 1. Activos sin precio configurado — excluye stablecoins y activos con fuente CoinGecko
  const noPriceRes = await db.query(
    `SELECT am.symbol
     FROM asset_metadata am
     WHERE am.price_source = 'unknown' AND am.is_stablecoin = FALSE
     ORDER BY am.symbol`
  );
  if (noPriceRes.rows.length > 0) {
    notifications.push({
      id: 'no-price',
      type: 'warning',
      category: 'Precios',
      message: `${noPriceRes.rows.length} activo${noPriceRes.rows.length > 1 ? 's' : ''} sin precio configurado: ${noPriceRes.rows.map((r: {symbol: string}) => r.symbol).join(', ')}`,
      count: noPriceRes.rows.length,
    });
  }

  // 2. Retiros sin wallet destino asignada (solo WITHDRAWs reales; otros types con el flag son datos corruptos)
  const pendingRes = await db.query(
    `SELECT asset, COUNT(*) as cnt FROM transactions
     WHERE destination_pending = TRUE AND operation_type = 'WITHDRAW'
     GROUP BY asset ORDER BY asset`
  );
  if (pendingRes.rows.length > 0) {
    const total = pendingRes.rows.reduce((s: number, r: {cnt: string}) => s + parseInt(r.cnt), 0);
    const assets = pendingRes.rows.map((r: {asset: string}) => r.asset).join(', ');
    notifications.push({
      id: 'pending-withdrawals',
      type: 'warning',
      category: 'Retiros',
      message: `${total} retiro${total > 1 ? 's' : ''} sin wallet destino asignada (${assets}). Ve a Historial para asignarlos.`,
      count: total,
    });
  }

  // 3. Depósitos de cripto externo sin coste de adquisición — bloquean el FIFO
  const cryptoDepositRes = await db.query(
    `SELECT COUNT(*) AS cnt FROM transactions
     WHERE notes LIKE '%Depósito de cripto externo%'
       AND price_per_unit IS NULL`
  );
  const cryptoDepositCount = parseInt(cryptoDepositRes.rows[0].cnt);
  if (cryptoDepositCount > 0) {
    notifications.push({
      id: 'crypto-deposits',
      type: 'warning',
      category: 'Depósitos',
      message: `${cryptoDepositCount} depósito${cryptoDepositCount > 1 ? 's' : ''} de cripto externo sin coste de adquisición. Revísalos en Importación antes de importar nuevos datos.`,
      count: cryptoDepositCount,
    });
  }

  // 4. Lotes FIFO con activo sin precio (no se puede valorar el portfolio)
  const noLotPriceRes = await db.query(
    `SELECT DISTINCT fl.asset
     FROM fifo_lots fl
     LEFT JOIN asset_metadata am ON am.symbol = fl.asset
     WHERE fl.is_closed = FALSE
       AND fl.quantity_remaining > 0
       AND (am.price_source = 'unknown' OR am.symbol IS NULL)
       AND (am.is_stablecoin = FALSE OR am.symbol IS NULL)
     ORDER BY fl.asset`
  );
  if (noLotPriceRes.rows.length > 0) {
    const assets = noLotPriceRes.rows.map((r: {asset: string}) => r.asset).join(', ');
    notifications.push({
      id: 'lots-no-price',
      type: 'error',
      category: 'Portfolio',
      message: `Activos en cartera sin precio de mercado: ${assets}. El valor del portfolio puede estar incompleto.`,
      count: noLotPriceRes.rows.length,
    });
  }

  res.json(notifications);
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
