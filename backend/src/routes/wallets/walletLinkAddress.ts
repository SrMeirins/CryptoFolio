import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { DIRECCION_RE, normalizarDireccion } from '../../modules/csv/retiradas/direccion';
import { verificarEnSegundoPlano } from '../../modules/walletSync/walletSync';
import { longText, sendZodError, shortText } from './shared';

const router = Router();

// POST /api/wallets/link-address (#320): guarda la dirección de un retiro en una
// wallet propia desde la revisión de la importación. A una wallet existente o a
// una nueva (la primera vez que no hay ninguna), en una sola transacción.
const nuevaWalletSchema = z.object({
  name:  shortText('name').trim().min(1, 'name es requerido'),
  type:  z.enum(['hardware', 'software'], { error: 'type debe ser hardware o software' }),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color debe ser un hexadecimal #RRGGBB'),
  notes: longText('notes').nullish(),
});

const bodySchema = z.object({
  walletId:   z.uuid('walletId debe ser un UUID válido').optional(),
  newWallet:  nuevaWalletSchema.optional(),
  network_id: z.uuid('network_id debe ser un UUID válido').nullable(),
  address:    z.string().trim().regex(DIRECCION_RE, 'address no es una dirección válida'),
}).refine(d => !!d.walletId !== !!d.newWallet, { error: 'Indica una wallet existente o una nueva, no ambas', path: ['walletId'] });

class ConflictoError extends Error {}
class NoEncontradaError extends Error {}

router.post('/link-address', async (req: Request, res: Response) => {
  const v = bodySchema.safeParse(req.body);
  if (!v.success) { sendZodError(res, v.error); return; }
  const { walletId, newWallet, network_id, address } = v.data;
  const normalizada = normalizarDireccion(address);

  try {
    const result = await db.transaction(async (client) => {
      // Una dirección pertenece a una sola wallet: compararla en su forma canónica.
      const dup = await client.query(
        `SELECT w.name FROM wallet_addresses wa JOIN wallets w ON w.id = wa.wallet_id
         WHERE CASE WHEN wa.address ~ '^0x[0-9a-fA-F]{40}$' THEN lower(wa.address) ELSE wa.address END = $1
         LIMIT 1`,
        [normalizada],
      );
      if (dup.rows.length > 0) throw new ConflictoError(`Esta dirección ya está guardada en «${dup.rows[0].name}»`);

      let wallet: { id: string; name: string; color: string };
      if (newWallet) {
        const ins = await client.query(
          `INSERT INTO wallets (name, type, color, notes) VALUES ($1, $2, $3, $4) RETURNING id, name, color`,
          [newWallet.name, newWallet.type, newWallet.color, newWallet.notes ?? null],
        );
        wallet = ins.rows[0];
      } else {
        // Solo wallets propias: nunca un exchange ni una wallet del sistema.
        const w = await client.query(
          `SELECT id, name, color FROM wallets WHERE id = $1 AND is_system = FALSE AND type <> 'exchange'`,
          [walletId],
        );
        if (w.rows.length === 0) throw new NoEncontradaError('Wallet no encontrada');
        wallet = w.rows[0];
      }

      const addr = await client.query(
        `INSERT INTO wallet_addresses (wallet_id, network_id, address) VALUES ($1, $2, $3) RETURNING id`,
        [wallet.id, network_id, address],
      );
      return { wallet, addressId: addr.rows[0].id as string };
    });
    res.status(201).json(result);
    // Verificación on-chain automática en segundo plano (#336).
    verificarEnSegundoPlano(result.addressId);
  } catch (err) {
    if (err instanceof ConflictoError) { res.status(409).json({ error: err.message }); return; }
    if (err instanceof NoEncontradaError) { res.status(404).json({ error: err.message }); return; }
    if ((err as { code?: string }).code === '23505') { res.status(409).json({ error: 'Ya existe una wallet con ese nombre' }); return; }
    if ((err as { code?: string }).code === '23503') { res.status(400).json({ error: 'La red indicada no existe' }); return; }
    throw err;
  }
});

export default router;
