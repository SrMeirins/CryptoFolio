import { db } from '../../db/client';

// Flujos de capital (#165): dinero o activos que entran o salen de la cartera
// sin ser rendimiento. Se restan del cambio de valor para obtener el P&L.
//
// Entradas: DEPOSIT_FIAT (EUR), depósitos con tarjeta OCBS (IGNORED en el
//           importador, ver OCBS_DEPOSIT_LABELS), DEPOSIT_CRYPTO, MARGIN_BORROW
//           (el préstamo no es ganancia; la deuda se refleja al devolverlo).
// Salidas:  WITHDRAW_FIAT (EUR), GIFT_SENT, MARGIN_REPAY.
// No son flujos: transferencias entre wallets propias (TRANSFER_INTERNAL y
// WITHDRAW, incluidas las retiradas a "Wallets externas"), compras y ventas.
// LOST no es flujo: la pérdida de acceso es una pérdida real.
//
// Las cantidades coinciden con las que usa el motor FIFO: amount_net en las
// entradas que abren lote y amount en las salidas que consumen lote.

// Etiquetas del CSV de Binance de los depósitos con tarjeta (OCBS). El
// importador los guarda como IGNORED ("asiento redundante"), pero son la
// entrada de los EUR que se gastan en la compra inmediatamente posterior.
export const OCBS_DEPOSIT_LABELS = ['Deposit Fiat OCBS', 'Fiat OCBS - Add Fiat and Fees'];

export interface CapitalFlow {
  asset: string;
  at: number;        // instante (ms epoch)
  quantity: number;  // + entrada, − salida
}

export async function loadCapitalFlows(): Promise<CapitalFlow[]> {
  const res = await db.query(
    `SELECT asset, timestamp,
            CASE operation_type
              WHEN 'DEPOSIT_FIAT'   THEN  amount
              WHEN 'IGNORED'        THEN  amount
              WHEN 'WITHDRAW_FIAT'  THEN -amount
              WHEN 'DEPOSIT_CRYPTO' THEN  amount_net
              WHEN 'MARGIN_BORROW'  THEN  amount_net
              WHEN 'GIFT_SENT'      THEN -amount
              WHEN 'MARGIN_REPAY'   THEN -amount
            END::float AS quantity
     FROM transactions
     WHERE operation_type IN ('DEPOSIT_FIAT','WITHDRAW_FIAT','DEPOSIT_CRYPTO','MARGIN_BORROW','GIFT_SENT','MARGIN_REPAY')
        OR (operation_type = 'IGNORED' AND asset = 'EUR' AND notes = ANY($1))`,
    [OCBS_DEPOSIT_LABELS],
  );
  return res.rows
    .map((r: { asset: string; timestamp: string; quantity: number }) =>
      ({ asset: r.asset, at: new Date(r.timestamp).getTime(), quantity: r.quantity }))
    .filter((f: CapitalFlow) => f.quantity !== 0);
}
