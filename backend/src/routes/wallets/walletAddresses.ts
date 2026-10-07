import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { syncWalletAddress } from '../../modules/walletSync/walletSync';
import { MAX_LENGTH_LONG } from '../../modules/validation/textLength';
import {
  sendZodError, shortText,
  walletIdParamSchema, walletAddressParamsSchema, walletSyncParamsSchema,
} from './shared';

const router = Router();

// POST /:id/addresses: network_id o custom_network son requeridos (una
// dirección necesita algún tipo de red asociada). PUT reutiliza los mismos
// campos pero sin esa exigencia — es un full-replace que ya permitía antes
// dejar ambos vacíos, comportamiento preservado deliberadamente.
const addressFields = {
  network_id:          z.string().uuid('network_id debe ser un UUID válido').nullish(),
  custom_network:      shortText('custom_network').nullish(),
  custom_explorer_url: z.string().url('custom_explorer_url debe ser una URL válida').max(MAX_LENGTH_LONG, `custom_explorer_url no puede superar ${MAX_LENGTH_LONG} caracteres`).nullish(),
  address:             shortText('address').nullish(),
};

const addressCreateBodySchema = z.object(addressFields).refine(
  (data) => !!data.network_id || !!data.custom_network,
  { message: 'network_id o custom_network son requeridos', path: ['network_id'] }
);

const addressUpdateBodySchema = z.object(addressFields);

// ── POST /api/wallets/:id/addresses ───────────────────────────────────────
router.post('/:id/addresses', async (req: Request, res: Response) => {
  const paramsValidation = walletIdParamSchema.safeParse(req.params);
  if (!paramsValidation.success) {
    sendZodError(res, paramsValidation.error);
    return;
  }
  const bodyValidation = addressCreateBodySchema.safeParse(req.body);
  if (!bodyValidation.success) {
    sendZodError(res, bodyValidation.error);
    return;
  }
  const { id } = paramsValidation.data;
  const { network_id, custom_network, custom_explorer_url, address } = bodyValidation.data;

  const result = await db.query(
    `INSERT INTO wallet_addresses (wallet_id, network_id, custom_network, custom_explorer_url, address)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [id, network_id ?? null, custom_network ?? null, custom_explorer_url ?? null, address ?? null]
  );
  res.status(201).json(result.rows[0]);
});

// ── PUT /api/wallets/:id/addresses/:addressId ──────────────────────────────
// Acotado por wallet_id además de id: antes esta query solo filtraba por
// addressId, así que se podía editar la dirección de OTRA wallet pasando
// cualquier :id en el path (confirmado como bug real, no solo IDOR teórico).
router.put('/:id/addresses/:addressId', async (req: Request, res: Response) => {
  const paramsValidation = walletAddressParamsSchema.safeParse(req.params);
  if (!paramsValidation.success) {
    sendZodError(res, paramsValidation.error);
    return;
  }
  const bodyValidation = addressUpdateBodySchema.safeParse(req.body);
  if (!bodyValidation.success) {
    sendZodError(res, bodyValidation.error);
    return;
  }
  const { id, addressId } = paramsValidation.data;
  const { network_id, custom_network, custom_explorer_url, address } = bodyValidation.data;

  const result = await db.query(
    `UPDATE wallet_addresses
     SET network_id = $1, custom_network = $2, custom_explorer_url = $3, address = $4
     WHERE id = $5 AND wallet_id = $6
     RETURNING id`,
    [network_id ?? null, custom_network ?? null, custom_explorer_url ?? null, address ?? null, addressId, id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Dirección no encontrada para esta wallet' });
    return;
  }
  res.json({ success: true });
});

// ── DELETE /api/wallets/:id/addresses/:addressId ───────────────────────────
// Mismo fix de acotación por wallet_id que PUT, mismo bug real.
router.delete('/:id/addresses/:addressId', async (req: Request, res: Response) => {
  const paramsValidation = walletAddressParamsSchema.safeParse(req.params);
  if (!paramsValidation.success) {
    sendZodError(res, paramsValidation.error);
    return;
  }
  const { id, addressId } = paramsValidation.data;

  const result = await db.query(
    'DELETE FROM wallet_addresses WHERE id = $1 AND wallet_id = $2 RETURNING id',
    [addressId, id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Dirección no encontrada para esta wallet' });
    return;
  }
  res.json({ success: true });
});

// ── GET /api/wallets/suggest/:asset ───────────────────────────────────────
// Sugerir wallet destino para un Withdraw de un activo concreto
router.get('/suggest/:asset', async (req: Request, res: Response) => {
  const { asset } = req.params;

  // Buscar redes donde este activo es nativo o token
  const networksRes = await db.query(`
    SELECT DISTINCT n.id AS network_id, n.name AS network_name, n.native_asset
    FROM networks n
    WHERE n.native_asset = $1
    UNION
    SELECT DISTINCT n.id, n.name, n.native_asset
    FROM networks n
    JOIN network_assets na ON na.network_id = n.id
    WHERE na.asset = $1
  `, [asset.toUpperCase()]);

  if (networksRes.rows.length === 0) {
    res.json({ suggestions: [] });
    return;
  }

  const networkIds = networksRes.rows.map((r: { network_id: string }) => r.network_id);

  // Buscar wallets que tengan direccion en alguna de esas redes
  const suggestionsRes = await db.query(`
    SELECT
      w.id AS wallet_id,
      w.name AS wallet_name,
      w.type AS wallet_type,
      w.color,
      wa.id AS address_id,
      wa.address,
      n.id AS network_id,
      n.name AS network_name,
      COALESCE(wa.custom_explorer_url, n.explorer_url) AS explorer_url
    FROM wallets w
    JOIN wallet_addresses wa ON wa.wallet_id = w.id
    JOIN networks n ON n.id = wa.network_id
    WHERE n.id = ANY($1::uuid[])
      AND w.is_system = FALSE
    ORDER BY w.name
  `, [networkIds]);

  res.json({ suggestions: suggestionsRes.rows, networks: networksRes.rows });
});

// ── POST /api/wallets/:walletId/addresses/:addressId/sync ─────────────────
// Acotado por wallet_id igual que PUT/DELETE: mismo bug real (walletId del
// path se ignoraba por completo, se podía disparar el sync de la dirección
// de OTRA wallet pasando cualquier walletId).
router.post('/:walletId/addresses/:addressId/sync', async (req: Request, res: Response) => {
  const paramsValidation = walletSyncParamsSchema.safeParse(req.params);
  if (!paramsValidation.success) {
    sendZodError(res, paramsValidation.error);
    return;
  }
  const { walletId, addressId } = paramsValidation.data;

  const owns = await db.query(
    'SELECT 1 FROM wallet_addresses WHERE id = $1 AND wallet_id = $2',
    [addressId, walletId]
  );
  if (owns.rows.length === 0) {
    res.status(404).json({ error: 'Dirección no encontrada para esta wallet' });
    return;
  }

  const results = await syncWalletAddress(addressId);
  res.json(results);
});

export default router;
