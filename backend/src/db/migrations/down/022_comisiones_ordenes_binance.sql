-- Reversión de 022: vuelve a la forma del parser anterior a #543.
--   - Cada línea «Transaction Fee» de una venta (en la propia venta o en su
--     FEE_EXCHANGE enlazada) vuelve a ser una FEE_EXCHANGE suelta, rehecha
--     desde su fila original del CSV (original_row, #374); la venta se queda
--     sin comisión.
--   - Las comisiones de compras dejan de estar enlazadas.
-- Solo ventas de «Transaction Sold/Revenue» o «Transaction Sell»: en la venta
-- en margen con «Transaction Buy» negativo la comisión ya iba dentro antes.
-- Las referencias del FIFO de las filas que desaparecen pasan a la venta; hay
-- que recalcular el FIFO después.

DROP TABLE IF EXISTS d022_filas;

CREATE TEMP TABLE d022_filas AS
SELECT r.id AS raw_id, uuid_generate_v4() AS nuevo_id, r.import_id, r.transaction_id AS actual,
       COALESCE(s.id, f.linked_tx_id) AS venta_id,
       r.original_row->>'Coin' AS moneda, abs((r.original_row->>'Change')::numeric) AS cantidad
FROM raw_transactions r
LEFT JOIN transactions s ON s.id = r.transaction_id AND s.operation_type = 'SELL'
LEFT JOIN transactions f ON f.id = r.transaction_id AND f.operation_type = 'FEE_EXCHANGE'
  AND f.linked_tx_id IS NOT NULL AND f.notes LIKE 'Fee en % para SELL %'
WHERE r.original_row->>'Operation' = 'Transaction Fee'
  AND (s.id IS NOT NULL OR f.id IS NOT NULL)
  AND EXISTS (SELECT 1 FROM raw_transactions v
              WHERE v.transaction_id = COALESCE(s.id, f.linked_tx_id)
                AND v.original_row->>'Operation' IN ('Transaction Sold', 'Transaction Revenue', 'Transaction Sell'));

-- Una FEE_EXCHANGE suelta por línea de comisión, como hacía el parser.
INSERT INTO transactions (id, import_id, operation_type, timestamp, asset, amount, amount_net, wallet_id, account, notes)
SELECT d.nuevo_id, d.import_id, 'FEE_EXCHANGE', v.timestamp, d.moneda, d.cantidad, d.cantidad, v.wallet_id, v.account,
       'Standalone Transaction Fee'
FROM d022_filas d JOIN transactions v ON v.id = d.venta_id;

UPDATE raw_transactions r SET transaction_id = d.nuevo_id FROM d022_filas d WHERE r.id = d.raw_id;

-- Las FEE_EXCHANGE enlazadas de ventas desaparecen: sus referencias del FIFO, a la venta.
DROP TABLE IF EXISTS d022_enlazadas;
CREATE TEMP TABLE d022_enlazadas AS
SELECT DISTINCT actual AS fee_id, venta_id FROM d022_filas WHERE actual <> venta_id;
UPDATE fifo_lot_consumptions c SET consuming_transaction_id = e.venta_id FROM d022_enlazadas e WHERE c.consuming_transaction_id = e.fee_id;
UPDATE fifo_lots l SET open_transaction_id = e.venta_id FROM d022_enlazadas e WHERE l.open_transaction_id = e.fee_id;
UPDATE fifo_shortfalls s SET transaction_id = e.venta_id FROM d022_enlazadas e WHERE s.transaction_id = e.fee_id;
DELETE FROM transactions WHERE id IN (SELECT fee_id FROM d022_enlazadas);

UPDATE transactions SET fee_asset = NULL, fee_amount = NULL, updated_at = NOW()
WHERE id IN (SELECT DISTINCT venta_id FROM d022_filas);

UPDATE transactions SET linked_tx_id = NULL, updated_at = NOW()
WHERE operation_type = 'FEE_EXCHANGE' AND linked_tx_id IS NOT NULL AND notes LIKE 'Fee en % para BUY %';

DROP TABLE d022_filas, d022_enlazadas;
