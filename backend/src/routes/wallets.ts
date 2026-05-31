import { Router, Request, Response } from 'express';
import { db } from '../db/client';

const router = Router();

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
            'last_known_balance',  wa.last_known_balance
          ) ORDER BY n.name
        ) FILTER (WHERE wa.id IS NOT NULL),
        '[]'
      ) AS addresses
    FROM wallets w
    LEFT JOIN wallet_addresses wa ON wa.wallet_id = w.id
    LEFT JOIN networks n ON n.id = wa.network_id
    GROUP BY w.id
    ORDER BY w.is_system DESC, w.created_at ASC
  `);
  res.json(wallets.rows);
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

// ── POST /api/wallets ──────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
  const { name, type, color, notes } = req.body;

  if (!name || !type) {
    res.status(400).json({ error: 'name y type son requeridos' });
    return;
  }

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
  const { id } = req.params;
  const { name, color, notes } = req.body;

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
  const { id } = req.params;

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

// ── POST /api/wallets/:id/addresses ───────────────────────────────────────
router.post('/:id/addresses', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { network_id, custom_network, custom_explorer_url, address } = req.body;

  if (!network_id && !custom_network) {
    res.status(400).json({ error: 'network_id o custom_network son requeridos' });
    return;
  }

  const result = await db.query(
    `INSERT INTO wallet_addresses (wallet_id, network_id, custom_network, custom_explorer_url, address)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [id, network_id ?? null, custom_network ?? null, custom_explorer_url ?? null, address ?? null]
  );
  res.status(201).json(result.rows[0]);
});

// ── PUT /api/wallets/:id/addresses/:addressId ──────────────────────────────
router.put('/:id/addresses/:addressId', async (req: Request, res: Response) => {
  const { addressId } = req.params;
  const { network_id, custom_network, custom_explorer_url, address } = req.body;

  await db.query(
    `UPDATE wallet_addresses
     SET network_id = $1, custom_network = $2, custom_explorer_url = $3, address = $4
     WHERE id = $5`,
    [network_id ?? null, custom_network ?? null, custom_explorer_url ?? null, address ?? null, addressId]
  );
  res.json({ success: true });
});

// ── DELETE /api/wallets/:id/addresses/:addressId ───────────────────────────
router.delete('/:id/addresses/:addressId', async (req: Request, res: Response) => {
  const { addressId } = req.params;
  await db.query('DELETE FROM wallet_addresses WHERE id = $1', [addressId]);
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

// ── POST /api/wallets/networks ────────────────────────────────────────────
router.post('/networks', async (req: Request, res: Response) => {
  const { name, native_asset, explorer_url, explorer_tx_url } = req.body;

  if (!name || !native_asset) {
    res.status(400).json({ error: 'name y native_asset son requeridos' });
    return;
  }

  const result = await db.query(
    `INSERT INTO networks (name, native_asset, explorer_url, explorer_tx_url, is_predefined)
     VALUES ($1, $2, $3, $4, FALSE)
     RETURNING *`,
    [name, native_asset, explorer_url ?? null, explorer_tx_url ?? null]
  );
  res.status(201).json(result.rows[0]);
});

export default router;