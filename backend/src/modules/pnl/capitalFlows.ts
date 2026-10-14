import { db } from '../../db/client';

// Flujos de capital (#165): dinero o activos que entran o salen de la cartera
// sin ser rendimiento. Se restan del cambio de valor para obtener el P&L.
//
// Entradas: DEPOSIT_FIAT (EUR, incluidos los depósitos con tarjeta OCBS desde
//           #169), DEPOSIT_CRYPTO, MARGIN_BORROW (el préstamo no es ganancia;
//           la deuda se refleja al devolverlo).
// Salidas:  WITHDRAW_FIAT (EUR), GIFT_SENT, MARGIN_REPAY (solo el principal:
//           el interés pagado es un coste y queda como pérdida, #185).
// No son flujos: transferencias entre wallets propias (TRANSFER_INTERNAL y
// WITHDRAW, incluidas las retiradas a "Wallets externas"), compras y ventas.
// LOST no es flujo: la pérdida de acceso es una pérdida real.
//
// Las cantidades coinciden con las que usa el motor FIFO: amount_net en las
// entradas que abren lote y amount en las salidas que consumen lote.

export interface CapitalFlow {
  asset: string;
  at: number;        // instante (ms epoch)
  quantity: number;  // + entrada, − salida
  // 'margin' para préstamos y devoluciones de margen: no son capital aportado
  // por el usuario y se excluyen del % sobre capital neto (#166).
  kind: 'capital' | 'margin';
}

interface FlowRow {
  asset: string;
  wallet_id: string | null;
  operation_type: string;
  timestamp: string | Date;
  quantity: number;
}

/**
 * Convierte las filas en flujos. En las devoluciones de margen solo el
 * principal es flujo: se lleva la deuda pendiente por activo y wallet en orden
 * cronológico (préstamo antes que devolución en el mismo instante) y lo
 * devuelto por encima de esa deuda es interés. Mismo criterio que el motor
 * FIFO (`processMarginRepay`), que registra ese exceso como pérdida.
 */
export function toCapitalFlows(rows: readonly FlowRow[]): CapitalFlow[] {
  const ordered = rows
    .map(r => ({ ...r, at: new Date(r.timestamp).getTime() }))
    .sort((a, b) => a.at - b.at || marginOrder(a.operation_type) - marginOrder(b.operation_type));

  const debt = new Map<string, number>(); // `${asset}|${wallet_id}`
  const flows: CapitalFlow[] = [];
  for (const r of ordered) {
    let quantity = r.quantity;
    const key = `${r.asset}|${r.wallet_id ?? ''}`;
    if (r.operation_type === 'MARGIN_BORROW') {
      debt.set(key, (debt.get(key) ?? 0) + quantity);
    } else if (r.operation_type === 'MARGIN_REPAY') {
      const pending = debt.get(key) ?? 0;
      const repaid = -quantity;
      const principal = Math.min(repaid, Math.max(0, pending));
      debt.set(key, Math.max(0, pending - repaid));
      quantity = -principal;
    }
    if (quantity === 0) continue;
    const kind = r.operation_type === 'MARGIN_BORROW' || r.operation_type === 'MARGIN_REPAY' ? 'margin' as const : 'capital' as const;
    flows.push({ asset: r.asset, at: r.at, quantity, kind });
  }
  return flows;
}

const marginOrder = (op: string): number => (op === 'MARGIN_BORROW' ? 0 : op === 'MARGIN_REPAY' ? 2 : 1);

export async function loadCapitalFlows(): Promise<CapitalFlow[]> {
  const res = await db.query(
    `SELECT asset, wallet_id, operation_type, timestamp,
            CASE operation_type
              WHEN 'DEPOSIT_FIAT'   THEN  amount
              WHEN 'WITHDRAW_FIAT'  THEN -amount
              WHEN 'DEPOSIT_CRYPTO' THEN  amount_net
              WHEN 'MARGIN_BORROW'  THEN  amount_net
              WHEN 'GIFT_SENT'      THEN -amount
              WHEN 'MARGIN_REPAY'   THEN -amount
            END::float AS quantity
     FROM transactions
     WHERE operation_type IN ('DEPOSIT_FIAT','WITHDRAW_FIAT','DEPOSIT_CRYPTO','MARGIN_BORROW','GIFT_SENT','MARGIN_REPAY')`,
  );
  return toCapitalFlows(res.rows as FlowRow[]);
}
