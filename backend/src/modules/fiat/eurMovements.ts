// Definición única de los movimientos del saldo en EUR (#169). La usan los
// saldos fiat (GET /api/fifo/fiat-balances), el flujo de EUR
// (GET /api/fifo/eur-flow) y el P&L diario (modules/pnl), que antes tenían
// cada uno su propia consulta y omitían movimientos distintos.
//
// Cada fila es una transacción que mueve EUR, con su importe con signo:
//   deposit       DEPOSIT_FIAT                                   +amount
//   withdraw      WITHDRAW_FIAT                                  −amount
//   crypto_to_eur BUY de EUR (venta de cripto a EUR)             +amount_net
//   eur_to_crypto SELL/SELL_FIAT/SELL_CRYPTO de EUR (compra con EUR) −amount
//   cashback      CASHBACK en EUR                                +amount_net
//   buy           BUY/BUY_FIAT/BUY_CRYPTO pagado en EUR          −cost_amount
//   sell          SELL/SELL_FIAT cobrado en EUR                  +cost_amount
//   fee           FEE_EXCHANGE pagada en EUR                     −cost_amount
//
// Las transferencias de EUR entre sub-cuentas propias no cambian el total y
// no se incluyen. Los depósitos con tarjeta (OCBS) se importan como
// DEPOSIT_FIAT (migración 002).

export type EurMovementKind =
  | 'deposit' | 'withdraw' | 'crypto_to_eur' | 'eur_to_crypto' | 'cashback' | 'buy' | 'sell' | 'fee';

export const EUR_MOVEMENTS_SQL = `
  SELECT id, timestamp, wallet_id, kind, amount::float AS amount FROM (
    SELECT id, timestamp, wallet_id,
           CASE operation_type
             WHEN 'DEPOSIT_FIAT'  THEN 'deposit'
             WHEN 'WITHDRAW_FIAT' THEN 'withdraw'
             WHEN 'BUY'           THEN 'crypto_to_eur'
             WHEN 'CASHBACK'      THEN 'cashback'
             ELSE 'eur_to_crypto'
           END AS kind,
           CASE
             WHEN operation_type = 'DEPOSIT_FIAT'            THEN  amount
             WHEN operation_type IN ('BUY', 'CASHBACK')      THEN  amount_net
             ELSE -amount
           END AS amount
    FROM transactions
    WHERE asset = 'EUR'
      AND operation_type IN ('DEPOSIT_FIAT', 'WITHDRAW_FIAT', 'BUY', 'CASHBACK', 'SELL', 'SELL_FIAT', 'SELL_CRYPTO')
    UNION ALL
    SELECT id, timestamp, wallet_id,
           CASE
             WHEN operation_type IN ('BUY', 'BUY_FIAT', 'BUY_CRYPTO') THEN 'buy'
             WHEN operation_type = 'FEE_EXCHANGE'                     THEN 'fee'
             ELSE 'sell'
           END AS kind,
           CASE
             WHEN operation_type IN ('SELL', 'SELL_FIAT') THEN  COALESCE(cost_amount, 0)
             ELSE -COALESCE(cost_amount, 0)
           END AS amount
    FROM transactions
    WHERE cost_asset = 'EUR'
      AND operation_type IN ('BUY', 'BUY_FIAT', 'BUY_CRYPTO', 'SELL', 'SELL_FIAT', 'FEE_EXCHANGE')
  ) movements
  WHERE amount <> 0
`;
