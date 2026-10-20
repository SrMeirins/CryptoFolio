import { db } from '../../../db/client';
import type { ParsedTransaction, RawRowWithHash } from '../types';
import type { Exchange } from '../exchanges';
import { parseVariosHistoriales } from './historialRetiradas';
import { resolverDestinos, type DestinoRetiro, type Red, type ResumenRetiradas } from './resolverDestinos';

// Carga las redes de la BD y resuelve el destino on-chain de los retiros (#320).

export async function cargarRedes(): Promise<Red[]> {
  const res = await db.query(
    `SELECT n.id, n.name, n.native_asset,
            COALESCE(array_agg(na.asset) FILTER (WHERE na.asset IS NOT NULL), '{}') AS tokens
     FROM networks n LEFT JOIN network_assets na ON na.network_id = n.id
     GROUP BY n.id`,
  );
  return res.rows.map((r: { id: string; name: string; native_asset: string; tokens: string[] }) => ({
    id: r.id, name: r.name, nativeAsset: r.native_asset, tokens: r.tokens,
  }));
}

export async function destinosDeRetiros(
  exchange: Exchange,
  parsed: { transactions: ParsedTransaction[]; rawRows: RawRowWithHash[] },
  retiradasBuffers: readonly Buffer[] = [],
): Promise<{ destinos: Map<string, DestinoRetiro>; resumen: ResumenRetiradas | null }> {
  const hayRetiros = parsed.transactions.some(tx => tx.operationType === 'WITHDRAW');
  if (!hayRetiros) return { destinos: new Map(), resumen: null };
  // El historial de retiradas solo aplica a Binance; con Bitvavo se ignora.
  const retiradas = exchange === 'binance' && retiradasBuffers.length > 0 ? parseVariosHistoriales(retiradasBuffers) : null;
  return resolverDestinos(exchange, parsed.transactions, parsed.rawRows, await cargarRedes(), retiradas);
}
