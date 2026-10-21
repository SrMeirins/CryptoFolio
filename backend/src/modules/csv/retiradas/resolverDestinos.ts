import type { ParsedTransaction, RawRowWithHash } from '../types';
import type { Exchange } from '../exchanges';
import { direccionValida } from './direccion';
import { emparejarRetiradas } from './emparejar';
import type { RetiradaBinance } from './historialRetiradas';
import { redDeBinance } from './redesBinance';

// Destino on-chain de cada retiro del archivo (#320). Módulo puro: las redes
// llegan cargadas de la BD por destinosDb.ts.

export interface Red {
  id: string;
  name: string;
  nativeAsset: string;
  tokens: string[];
}

export interface DestinoRetiro {
  address: string | null;
  networkId: string | null;
  network: string | null;
  /** Solo hashes on-chain reales; el «Transaction ID» de Bitvavo es interno y no se usa. */
  txHash: string | null;
  /**
   * Comisión de red del historial de retiradas de Binance (#335): llega a destino
   * el importe sin ella. En Bitvavo la separa ya el parser, así que aquí es null.
   */
  fee: number | null;
}

export interface ResumenRetiradas {
  /** Retiradas completadas del historial de Binance. */
  filas: number;
  /** Retiros del archivo de transacciones que han encontrado su retirada. */
  emparejadas: number;
  /** Retiros del archivo de transacciones (nuevos o no). */
  retiros: number;
}

/** Red de un activo sin columna de red (Bitvavo): la nativa, o la única red que lo tiene como token. */
export function redDeActivo(asset: string, redes: Red[]): Red | null {
  const nativa = redes.find(r => r.nativeAsset === asset);
  if (nativa) return nativa;
  const conToken = redes.filter(r => r.tokens.includes(asset));
  return conToken.length === 1 ? conToken[0] : null;
}

export function resolverDestinos(
  exchange: Exchange,
  transactions: ParsedTransaction[],
  rawRows: RawRowWithHash[],
  redes: Red[],
  retiradas: RetiradaBinance[] | null,
): { destinos: Map<string, DestinoRetiro>; resumen: ResumenRetiradas | null } {
  const destinos = new Map<string, DestinoRetiro>();
  const retiros = transactions.filter(tx => tx.operationType === 'WITHDRAW' && tx.rawRowHashes[0]);

  if (exchange === 'bitvavo') {
    const recordPorHash = new Map(rawRows.map(r => [r.hash, r.record]));
    for (const tx of retiros) {
      const key = tx.rawRowHashes[0];
      const address = direccionValida(recordPorHash.get(key)?.Address);
      if (!address) continue;
      const red = redDeActivo(tx.asset, redes);
      destinos.set(key, { address, networkId: red?.id ?? null, network: red?.name ?? null, txHash: null, fee: null });
    }
    return { destinos, resumen: null };
  }

  if (!retiradas) return { destinos, resumen: null };
  const pares = emparejarRetiradas(
    retiros.map(tx => ({ key: tx.rawRowHashes[0], asset: tx.asset, amount: tx.amount, timestamp: tx.timestamp })),
    retiradas,
  );
  for (const [key, w] of pares) {
    if (!w.address && !w.txHash && !(w.fee > 0)) continue;
    const nombre = redDeBinance(w.network);
    const red = nombre ? redes.find(r => r.name === nombre) ?? null : null;
    destinos.set(key, { address: w.address, networkId: red?.id ?? null, network: red?.name ?? null, txHash: w.txHash, fee: w.fee > 0 ? w.fee : null });
  }
  return { destinos, resumen: { filas: retiradas.length, emparejadas: pares.size, retiros: retiros.length } };
}
