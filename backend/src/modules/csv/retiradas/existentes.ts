import { db } from '../../../db/client';
import { parseExchangeCsv, type Exchange } from '../exchanges';
import { parseVariosHistoriales } from './historialRetiradas';
import { emparejarRetiradas } from './emparejar';
import { redDeBinance } from './redesBinance';
import { resolverDestinos, type DestinoRetiro } from './resolverDestinos';
import { cargarRedes } from './destinosDb';

// Retiros ya importados sin dirección (#330): se completan con el historial de
// retiradas de Binance (mismo emparejamiento que #320) o, en Bitvavo, con la
// columna Address de su fila al volver a subir el CSV (enlazada por el hash).

export interface RetiroExistente {
  id: string;
  exchange: Exchange;
  timestamp: string;
  asset: string;
  amount: number;
  account: string;
  /** Destino actual: wallet propia (id), '__external__', '__gift__', '__lost__' o '' si está pendiente. */
  destinoActual: string;
  destino: DestinoRetiro;
}

interface FilaRetiro {
  id: string; asset: string; amount: string; timestamp: Date; account: string; operation_type: string;
  destination_wallet_id: string | null; destination_pending: boolean; destino_nombre: string | null;
  counterparty_address: string | null; fee_amount: string | null;
}

const COLUMNAS = `t.id, t.asset, t.amount, t.timestamp, t.account, t.operation_type::text AS operation_type,
  t.destination_wallet_id, t.destination_pending, w.name AS destino_nombre, t.counterparty_address, t.fee_amount`;

function destinoActual(f: FilaRetiro): string {
  if (f.operation_type === 'LOST') return '__lost__';
  if (f.operation_type === 'GIFT_SENT') return '__gift__';
  if (f.destination_pending || !f.destination_wallet_id) return '';
  return f.destino_nombre === 'Wallets externas' ? '__external__' : f.destination_wallet_id;
}

const aRetiro = (f: FilaRetiro, exchange: Exchange, destino: DestinoRetiro): RetiroExistente => ({
  id: f.id, exchange, timestamp: new Date(f.timestamp).toISOString(), asset: f.asset, amount: parseFloat(f.amount),
  account: f.account, destinoActual: destinoActual(f), destino,
});

export async function retirosExistentes(
  archivos: readonly { exchange: Exchange; buffer: Buffer }[],
  retiradasBuffers: readonly Buffer[],
): Promise<RetiroExistente[]> {
  const out: RetiroExistente[] = [];
  const redes = await cargarRedes();

  // Binance: retiros ya importados sin dirección, o sin la comisión de red separada
  // (#335: importados antes de separarla) ↔ historial de retiradas. Sin comisión
  // separada, el importe guardado es el bruto (|Change|), que es lo que se empareja.
  if (retiradasBuffers.length > 0) {
    const filas = (await db.query(
      `SELECT ${COLUMNAS} FROM transactions t
       JOIN csv_imports ci ON ci.id = t.import_id
       LEFT JOIN wallets w ON w.id = t.destination_wallet_id
       WHERE ci.exchange = 'binance' AND t.operation_type IN ('WITHDRAW', 'LOST', 'GIFT_SENT')
         AND (t.counterparty_address IS NULL OR (t.operation_type = 'WITHDRAW' AND t.fee_amount IS NULL))
         AND t.original_import IS NULL  -- las editadas a mano no se tocan (#378)
      `,
    )).rows as FilaRetiro[];
    const pares = emparejarRetiradas(
      filas.map(f => ({ key: f.id, asset: f.asset, amount: parseFloat(f.amount), timestamp: new Date(f.timestamp) })),
      parseVariosHistoriales(retiradasBuffers),
    );
    for (const f of filas) {
      const w = pares.get(f.id);
      if (!w) continue;
      const completaDireccion = !f.counterparty_address && (w.address || w.txHash);
      const completaComision = f.operation_type === 'WITHDRAW' && f.fee_amount === null && w.fee > 0;
      if (!completaDireccion && !completaComision) continue;
      const nombre = redDeBinance(w.network);
      const red = nombre ? redes.find(r => r.name === nombre) ?? null : null;
      out.push(aRetiro(f, 'binance', { address: w.address, networkId: red?.id ?? null, network: red?.name ?? null, txHash: w.txHash, fee: w.fee > 0 ? w.fee : null }));
    }
  }

  // Bitvavo: filas del CSV ya importadas cuyo retiro aún no tiene dirección.
  for (const a of archivos.filter(x => x.exchange === 'bitvavo')) {
    const parsed = await parseExchangeCsv('bitvavo', a.buffer);
    const { destinos } = resolverDestinos('bitvavo', parsed.transactions, parsed.rawRows, redes, null);
    if (destinos.size === 0) continue;
    const filas = (await db.query(
      `SELECT ${COLUMNAS}, rt.row_hash FROM raw_transactions rt
       JOIN transactions t ON t.id = rt.transaction_id
       LEFT JOIN wallets w ON w.id = t.destination_wallet_id
       WHERE rt.row_hash = ANY($1) AND t.counterparty_address IS NULL AND t.original_import IS NULL
         AND t.operation_type IN ('WITHDRAW', 'LOST', 'GIFT_SENT')`,
      [[...destinos.keys()]],
    )).rows as (FilaRetiro & { row_hash: string })[];
    for (const f of filas) {
      if (out.some(o => o.id === f.id)) continue;
      out.push(aRetiro(f, 'bitvavo', destinos.get(f.row_hash)!));
    }
  }

  return out.sort((x, y) => x.timestamp.localeCompare(y.timestamp));
}
