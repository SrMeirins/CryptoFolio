import type { PoolClient } from 'pg';
import type { ParsedTransaction } from '../types';

// Comisión de red de los retiros de Binance (#335). El historial de
// transacciones solo da |Change| = importe + comisión; con el historial de
// retiradas se separa: llega a destino el importe y la comisión se registra en
// el mismo activo (el FIFO la consume como disposición, igual que en Bitvavo).

/** Retiro con la comisión separada; sin cambios si no hay comisión, ya la tiene o no cabe. */
export function conComision(tx: ParsedTransaction, fee: number | null): ParsedTransaction {
  if (!fee || fee <= 0 || tx.feeAmount || fee >= tx.amount) return tx;
  return { ...tx, amount: tx.amount - fee, amountNet: tx.amountNet - fee, feeAsset: tx.asset, feeAmount: fee };
}

/**
 * Lo mismo sobre un retiro ya importado: solo si sigue siendo WITHDRAW y aún no
 * tiene comisión. Devuelve si lo ha cambiado (para saber si recalcular el FIFO).
 */
export async function aplicarComisionRetiro(client: PoolClient, transactionId: string, fee: number | null): Promise<boolean> {
  if (!fee || fee <= 0) return false;
  const r = await client.query(
    `UPDATE transactions
     SET amount = amount - $1, amount_net = amount_net - $1, fee_asset = asset, fee_amount = $1
     WHERE id = $2 AND operation_type = 'WITHDRAW' AND fee_amount IS NULL AND amount > $1`,
    [fee, transactionId],
  );
  return (r.rowCount ?? 0) > 0;
}
