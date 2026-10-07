import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { encryptApiKey } from '../../modules/walletSync/apiKeyCrypto';
import { longText, networkIdParamSchema, sendZodError, shortText } from './shared';

const router = Router();

const networkCreateBodySchema = z.object({
  name:            shortText('name').min(1, 'name es requerido'),
  native_asset:    shortText('native_asset').min(1, 'native_asset es requerido'),
  explorer_url:    longText('explorer_url').nullish(),
  explorer_tx_url: longText('explorer_tx_url').nullish(),
});

const apiKeyBodySchema = z.object({
  api_key: z.string().min(1, 'api_key es requerida').max(2048, 'api_key no puede superar 2048 caracteres'),
});

// ── GET /api/wallets/networks ──────────────────────────────────────────────
router.get('/networks', async (_req: Request, res: Response) => {
  const networks = await db.query(`
    SELECT
      n.id, n.name, n.native_asset, n.explorer_url, n.explorer_tx_url, n.is_predefined,
      COALESCE(
        json_agg(
          json_build_object(
            'id',               na.id,
            'asset',            na.asset,
            'contract_address', na.contract_address,
            'is_predefined',    na.is_predefined
          ) ORDER BY na.asset
        ) FILTER (WHERE na.id IS NOT NULL),
        '[]'
      ) AS tokens
    FROM networks n
    LEFT JOIN network_assets na ON na.network_id = n.id
    GROUP BY n.id
    ORDER BY n.is_predefined DESC, n.name ASC
  `);
  res.json(networks.rows);
});

// ── POST /api/wallets/networks ────────────────────────────────────────────
router.post('/networks', async (req: Request, res: Response) => {
  const validation = networkCreateBodySchema.safeParse(req.body);
  if (!validation.success) {
    sendZodError(res, validation.error);
    return;
  }
  const { name, native_asset, explorer_url, explorer_tx_url } = validation.data;

  const result = await db.query(
    `INSERT INTO networks (name, native_asset, explorer_url, explorer_tx_url, is_predefined)
     VALUES ($1, $2, $3, $4, FALSE)
     RETURNING *`,
    [name, native_asset, explorer_url ?? null, explorer_tx_url ?? null]
  );
  res.status(201).json(result.rows[0]);
});

// ── GET /api/wallets/networks/:networkId/api-key ───────────────────────────
// Nunca devuelve la clave en claro ni el valor cifrado — solo si existe.
router.get('/networks/:networkId/api-key', async (req: Request, res: Response) => {
  const paramsValidation = networkIdParamSchema.safeParse(req.params);
  if (!paramsValidation.success) {
    sendZodError(res, paramsValidation.error);
    return;
  }
  const { networkId } = paramsValidation.data;

  const result = await db.query(
    `SELECT updated_at FROM network_api_keys WHERE network_id = $1`,
    [networkId]
  );
  res.json({
    network_id: networkId,
    has_key: result.rows.length > 0,
    updated_at: result.rows[0]?.updated_at ?? null,
  });
});

// ── PUT /api/wallets/networks/:networkId/api-key ────────────────────────────
router.put('/networks/:networkId/api-key', async (req: Request, res: Response) => {
  const paramsValidation = networkIdParamSchema.safeParse(req.params);
  if (!paramsValidation.success) {
    sendZodError(res, paramsValidation.error);
    return;
  }
  const bodyValidation = apiKeyBodySchema.safeParse(req.body);
  if (!bodyValidation.success) {
    sendZodError(res, bodyValidation.error);
    return;
  }
  const { networkId } = paramsValidation.data;
  const { api_key } = bodyValidation.data;

  const { encrypted, iv } = encryptApiKey(api_key);
  await db.query(
    `INSERT INTO network_api_keys (network_id, api_key_encrypted, api_key_iv, updated_at)
     VALUES ($1, $2, $3, clock_timestamp())
     ON CONFLICT (network_id) DO UPDATE SET api_key_encrypted = $2, api_key_iv = $3, updated_at = clock_timestamp()`,
    [networkId, encrypted, iv]
  );
  res.json({ success: true });
});

// ── DELETE /api/wallets/networks/:networkId/api-key ─────────────────────────
router.delete('/networks/:networkId/api-key', async (req: Request, res: Response) => {
  const paramsValidation = networkIdParamSchema.safeParse(req.params);
  if (!paramsValidation.success) {
    sendZodError(res, paramsValidation.error);
    return;
  }
  const { networkId } = paramsValidation.data;

  await db.query(`DELETE FROM network_api_keys WHERE network_id = $1`, [networkId]);
  res.json({ success: true });
});

export default router;
