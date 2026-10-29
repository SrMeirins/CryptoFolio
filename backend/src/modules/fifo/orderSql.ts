// Orden en que el motor FIFO procesa las transacciones (#380): lo comparten el
// motor y el saldo corrido del Historial, para que el saldo tras cada operación
// siga el mismo orden que los lotes. El motor además corrige en memoria el
// préstamo de margen de Binance que llega segundos después de su venta
// (ordering.ts); ese ajuste no está aquí.

/** Expresión ORDER BY (sin la palabra clave). `alias` es el de la tabla transactions. */
export function fifoOrderBy(alias = ''): string {
  const p = alias ? `${alias}.` : '';
  return `${p}timestamp ASC, ${p}created_at ASC,
   -- Dentro del mismo segundo, abrir lotes antes de consumirlos.
   -- BUY/INCOME primero → luego SELL/FEE_EXCHANGE que necesitan esos lotes.
   CASE ${p}operation_type
     -- Prioridad 0: préstamos → lote abierto antes que cualquier venta del activo prestado
     WHEN 'MARGIN_BORROW'   THEN 0
     -- Prioridad 1: ingresos puros (solo crean lotes, no consumen)
     WHEN 'AIRDROP'         THEN 1
     WHEN 'DEPOSIT_CRYPTO'  THEN 1
     WHEN 'STAKING_REWARD'  THEN 1
     WHEN 'MINING_REWARD'   THEN 1
     WHEN 'LENDING_INTEREST'        THEN 1
     WHEN 'LENDING_INTEREST_LOCKED' THEN 1
     WHEN 'CASHBACK'        THEN 1
     WHEN 'FORK'            THEN 1
     -- Prioridad 2: transferencias internas → mueven/crean lotes entre wallets ANTES de
     -- que SELL o BUY intenten consumirlos (p.ej. Spot→Strategy al mismo timestamp que
     -- una venta o compra en Strategy — antes solo se protegía el caso BUY, no SELL)
     WHEN 'TRANSFER_INTERNAL' THEN 2
     -- Prioridad 3: ventas → consumen lotes del activo vendido Y crean lotes del recibido (p.ej. USDT)
     WHEN 'SELL'            THEN 3
     WHEN 'SELL_FIAT'       THEN 3
     WHEN 'SELL_CRYPTO'     THEN 3
     WHEN 'GIFT_SENT'       THEN 3
     WHEN 'LOST'            THEN 3
     -- Prioridad 4: compras → crean lote del activo recibido y consumen el cost_asset (p.ej. USDT)
     WHEN 'BUY'             THEN 4
     WHEN 'BUY_FIAT'        THEN 4
     WHEN 'BUY_CRYPTO'      THEN 4
     -- Prioridad 5: retiros externos
     WHEN 'WITHDRAW'        THEN 5
     -- Prioridad 6: fees → siempre al final (consumen lotes del activo de fee)
     WHEN 'FEE_EXCHANGE'    THEN 6
     WHEN 'FEE'             THEN 6
     WHEN 'FEE_NETWORK'     THEN 6
     -- Prioridad 7: devolución de préstamo → cierra los lotes de MARGIN_BORROW
     WHEN 'MARGIN_REPAY'    THEN 7
     ELSE 7
   END`;
}
