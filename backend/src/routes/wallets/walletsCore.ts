import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { longText, sendZodError, shortText, walletIdParamSchema, WALLET_KINDS } from './shared';

const router = Router();

const walletCreateBodySchema = z.object({
  name:  shortText('name').min(1, 'name es requerido'),
  type:  z.enum(WALLET_KINDS, { message: `type debe ser uno de: ${WALLET_KINDS.join(', ')}` }),
  color: shortText('color').nullish(),
  notes: longText('notes').nullish(),
});

const walletUpdateBodySchema = z.object({
  name:  shortText('name').min(1, 'name es requerido'),
  color: shortText('color').nullish(),
  notes: longText('notes').nullish(),
});

// ── GET /api/wallets ───────────────────────────────────────────────────────
router.get('/', async (_req: Request, res: Response) => {
  const wallets = await db.query(`
    SELECT
      w.id, w.name, w.type, w.is_system, w.is_default, w.color, w.notes, w.created_at,
      COALESCE(
        json_agg(
          json_build_object(
            'id',                  wa.id,
            'network_id',          wa.network_id,
            'network_name',        n.name,
            'network_native_asset', n.native_asset,
            'explorer_url',        COALESCE(wa.custom_explorer_url, n.explorer_url),
            'custom_network',      wa.custom_network,
            'address',             wa.address,
            'last_sync_at',        wa.last_sync_at,
            'last_known_balance',  wa.last_known_balance,
            'sync_status', (
              SELECT CASE
                WHEN bool_or(status = 'discrepancy') THEN 'discrepancy'
                WHEN bool_or(status = 'error') THEN 'error'
                WHEN COUNT(*) > 0 THEN 'ok'
                ELSE 'pending'
              END
              FROM (
                SELECT DISTINCT ON (asset) asset, status
                FROM balance_sync_log
                WHERE wallet_address_id = wa.id
                ORDER BY asset, checked_at DESC
              ) latest
            ),
            'sync_details', (
              SELECT COALESCE(json_agg(json_build_object(
                'asset', asset, 'onchain_balance', onchain_balance,
                'expected_balance', expected_balance, 'checked_at', checked_at, 'status', status
              )), '[]')
              FROM (
                SELECT DISTINCT ON (asset) asset, onchain_balance, expected_balance, checked_at, status
                FROM balance_sync_log
                WHERE wallet_address_id = wa.id
                ORDER BY asset, checked_at DESC
              ) latest
            )
          ) ORDER BY n.name
        ) FILTER (WHERE wa.id IS NOT NULL),
        '[]'
      ) AS addresses
    FROM wallets w
    LEFT JOIN wallet_addresses wa ON wa.wallet_id = w.id
    LEFT JOIN networks n ON n.id = wa.network_id
    WHERE
      -- Exchanges (sub-cuentas de Binance) siempre visibles
      w.type = 'exchange'
      -- Wallets propias del usuario (no son del sistema)
      OR w.is_system = FALSE
    GROUP BY w.id
    ORDER BY w.is_system DESC, w.created_at ASC
  `);
  res.json(wallets.rows);
});

// ── POST /api/wallets ──────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
  const validation = walletCreateBodySchema.safeParse(req.body);
  if (!validation.success) {
    sendZodError(res, validation.error);
    return;
  }
  const { name, type, color, notes } = validation.data;

  const result = await db.query(
    `INSERT INTO wallets (name, type, color, notes)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [name, type, color ?? '#6366f1', notes ?? null]
  );
  res.status(201).json(result.rows[0]);
});

// ── PUT /api/wallets/:id ───────────────────────────────────────────────────
router.put('/:id', async (req: Request, res: Response) => {
  const paramsValidation = walletIdParamSchema.safeParse(req.params);
  if (!paramsValidation.success) {
    sendZodError(res, paramsValidation.error);
    return;
  }
  const bodyValidation = walletUpdateBodySchema.safeParse(req.body);
  if (!bodyValidation.success) {
    sendZodError(res, bodyValidation.error);
    return;
  }
  const { id } = paramsValidation.data;
  const { name, color, notes } = bodyValidation.data;

  const wallet = await db.query('SELECT is_system FROM wallets WHERE id = $1', [id]);
  if (wallet.rows.length === 0) {
    res.status(404).json({ error: 'Wallet no encontrada' });
    return;
  }

  await db.query(
    `UPDATE wallets SET name = $1, color = $2, notes = $3 WHERE id = $4`,
    [name, color, notes ?? null, id]
  );
  res.json({ success: true });
});

// ── DELETE /api/wallets/:id ────────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response) => {
  const paramsValidation = walletIdParamSchema.safeParse(req.params);
  if (!paramsValidation.success) {
    sendZodError(res, paramsValidation.error);
    return;
  }
  const { id } = paramsValidation.data;

  const wallet = await db.query('SELECT is_system FROM wallets WHERE id = $1', [id]);
  if (wallet.rows.length === 0) {
    res.status(404).json({ error: 'Wallet no encontrada' });
    return;
  }
  if (wallet.rows[0].is_system) {
    res.status(403).json({ error: 'No se puede borrar una wallet del sistema' });
    return;
  }

  await db.query('DELETE FROM wallets WHERE id = $1', [id]);
  res.json({ success: true });
});

export default router;
