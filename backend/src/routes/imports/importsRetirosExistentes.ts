import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { detectarExchange, type Exchange } from '../../modules/csv/exchanges';
import { retirosExistentes } from '../../modules/csv/retiradas/existentes';
import { runFifoEngine } from '../../modules/fifo/engine';
import { aplicarComisionRetiro } from '../../modules/csv/retiradas/comision';
import { archivosDe, exchangesForzados, retiradasDe, uploadCsv } from './importsValidation';

const router = Router();

const ESPECIALES = ['__external__', '__gift__', '__lost__'] as const;
const reasignacionesSchema = z.record(
  z.string().uuid(),
  z.union([z.enum(ESPECIALES), z.string().uuid()]),
);

class PeticionInvalida extends Error {}

// POST /api/imports/retiros-existentes (#330): completa dirección, red y TXID de
// retiros ya importados y aplica los cambios de destino elegidos en la revisión.
// El emparejamiento se recalcula aquí con los mismos archivos: el cliente solo
// decide destinos, y solo de retiros emparejados en esta petición.
router.post('/retiros-existentes', uploadCsv, async (req: Request, res: Response) => {
  const archivos = archivosDe(req);
  const retiradas = retiradasDe(req);
  if (archivos.length === 0 && retiradas.length === 0) { res.status(400).json({ error: 'No se recibió ningún archivo' }); return; }

  let forzados: (Exchange | null)[];
  let reasignaciones: Record<string, string> = {};
  try {
    forzados = exchangesForzados(req.body, archivos.length);
    if (typeof req.body.reasignaciones === 'string' && req.body.reasignaciones !== '') {
      const v = reasignacionesSchema.safeParse(JSON.parse(req.body.reasignaciones));
      if (!v.success) throw new Error('reasignaciones no es válido');
      reasignaciones = v.data;
    }
  } catch (e) { res.status(400).json({ error: (e as Error).message }); return; }

  const exchanges = archivos.map((f, i) => forzados[i] ?? detectarExchange(f.buffer).exchange ?? 'binance');
  const existentes = await retirosExistentes(archivos.map((f, i) => ({ exchange: exchanges[i], buffer: f.buffer })), retiradas);
  const porId = new Map(existentes.map(e => [e.id, e]));

  try {
    const resultado = await db.transaction(async (client) => {
      const ajenos = Object.keys(reasignaciones).filter(id => !porId.has(id));
      if (ajenos.length > 0) throw new PeticionInvalida('Hay reasignaciones de retiros que no corresponden a estos archivos');

      // Destinos: wallets propias (nunca un exchange ni del sistema) o especiales.
      const walletIds = [...new Set(Object.values(reasignaciones).filter(d => !ESPECIALES.includes(d as typeof ESPECIALES[number])))];
      if (walletIds.length > 0) {
        const ok = await client.query(`SELECT id FROM wallets WHERE id = ANY($1) AND is_system = FALSE AND type <> 'exchange'`, [walletIds]);
        if (ok.rows.length !== walletIds.length) throw new PeticionInvalida('Algún destino no es una wallet propia');
      }
      const externa = (await client.query(`SELECT id FROM wallets WHERE name = 'Wallets externas' LIMIT 1`)).rows[0]?.id ?? null;

      let direcciones = 0;
      for (const e of existentes) {
        const r = await client.query(
          `UPDATE transactions
           SET counterparty_address = COALESCE(counterparty_address, $1),
               counterparty_network_id = COALESCE(counterparty_network_id, $2),
               tx_hash = COALESCE(tx_hash, $3)
           WHERE id = $4 AND counterparty_address IS NULL`,
          [e.destino.address, e.destino.networkId, e.destino.txHash, e.id],
        );
        direcciones += r.rowCount ?? 0;
      }

      let destinos = 0;
      for (const [id, dest] of Object.entries(reasignaciones)) {
        if (porId.get(id)!.destinoActual === dest) continue;
        if (dest === '__gift__' || dest === '__lost__') {
          await client.query(
            `UPDATE transactions SET operation_type = $1::operation_type, destination_wallet_id = NULL, destination_pending = FALSE WHERE id = $2`,
            [dest === '__gift__' ? 'GIFT_SENT' : 'LOST', id],
          );
        } else {
          const wallet = dest === '__external__' ? externa : dest;
          await client.query(
            `UPDATE transactions SET operation_type = 'WITHDRAW', destination_wallet_id = $1, destination_pending = $2 WHERE id = $3`,
            [wallet, wallet === null, id],
          );
        }
        destinos++;
      }

      // Comisión de red (#335), después de los destinos: solo en los que siguen siendo retiros.
      let comisiones = 0;
      for (const e of existentes) if (await aplicarComisionRetiro(client, e.id, e.destino.fee)) comisiones++;
      return { direcciones, destinos, comisiones };
    });

    // Un cambio de destino o de comisión altera lotes y eventos fiscales: se recalcula el FIFO.
    const fifo = resultado.destinos > 0 || resultado.comisiones > 0;
    if (fifo) await runFifoEngine();
    res.json({ ...resultado, fifo });
  } catch (e) {
    if (e instanceof PeticionInvalida) { res.status(400).json({ error: e.message }); return; }
    throw e;
  }
});

export default router;
