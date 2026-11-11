-- 022 — Comisiones de las órdenes de Binance (#543).
--
-- Binance escribe la comisión de cada fill («Transaction Fee») con la misma
-- hora exacta que el fill. El parser agrupaba esa línea con las compras, así
-- que en las ventas quedaba como FEE_EXCHANGE suelta («Standalone Transaction
-- Fee») y su importe no se restaba de la venta. Y cuando una orden pagaba
-- comisión en dos monedas (el activo y BNB), la segunda quedaba como
-- FEE_EXCHANGE sin relación con su orden.
--
-- Esta migración deja los datos como los importaría hoy el parser corregido:
--   1. Venta con comisiones sueltas en el mismo instante y la misma wallet:
--      la moneda principal (la recibida, si no la vendida, si no la primera)
--      pasa a la propia venta y sus filas se eliminan; cada otra moneda queda
--      en una sola FEE_EXCHANGE enlazada a la venta (linked_tx_id).
--   2. «Fee en X para BUY Y»: se enlaza a su compra.
-- Solo instantes sin ambigüedad: una única compraventa en ese instante y
-- wallet, venta sin comisión propia y ninguna fila editada a mano (#378).
-- Las filas en bruto pasan a apuntar a la transacción que las conserva.
-- Los consumos FIFO de las filas eliminadas se deshacen (devuelven su
-- cantidad al lote); el siguiente recálculo del FIFO aplica el criterio nuevo.
-- Idempotente: una segunda pasada no encuentra nada que cambiar.
-- Reversión: migrations/down/022_comisiones_ordenes_binance.sql

DROP TABLE IF EXISTS m022_pares, m022_conserva, m022_destino;

-- Comisiones sueltas y su venta del mismo instante.
CREATE TEMP TABLE m022_pares AS
SELECT f.id AS fee_id, s.id AS venta_id, s.asset AS vendido, s.cost_asset AS recibido,
       COALESCE(f.fee_asset, f.asset) AS moneda, COALESCE(f.fee_amount, f.amount) AS cantidad
FROM transactions f
JOIN transactions s
  ON s.wallet_id = f.wallet_id AND s.timestamp = f.timestamp AND s.operation_type = 'SELL'
WHERE f.operation_type = 'FEE_EXCHANGE'
  AND f.notes = 'Standalone Transaction Fee'
  AND f.import_id IS NOT NULL AND s.import_id IS NOT NULL
  AND f.original_import IS NULL AND s.original_import IS NULL
  AND s.fee_asset IS NULL AND s.fee_amount IS NULL
  AND (SELECT count(*) FROM transactions o
       WHERE o.wallet_id = f.wallet_id AND o.timestamp = f.timestamp
         AND o.operation_type IN ('BUY', 'BUY_FIAT', 'BUY_CRYPTO', 'SELL', 'SELL_FIAT', 'SELL_CRYPTO')) = 1;

-- Moneda principal de cada venta: la recibida, si no la vendida, si no la primera.
ALTER TABLE m022_pares ADD COLUMN principal BOOLEAN;
UPDATE m022_pares p SET principal = (p.moneda = x.moneda)
FROM (
  SELECT DISTINCT ON (venta_id) venta_id, moneda
  FROM m022_pares
  ORDER BY venta_id, CASE WHEN moneda = recibido THEN 0 WHEN moneda = vendido THEN 1 ELSE 2 END, moneda
) x
WHERE x.venta_id = p.venta_id;

-- Fila que conserva cada moneda secundaria (una por venta y moneda).
CREATE TEMP TABLE m022_conserva AS
SELECT DISTINCT ON (venta_id, moneda) venta_id, moneda, vendido, fee_id
FROM m022_pares WHERE NOT principal
ORDER BY venta_id, moneda, fee_id::text;

-- 1a. La comisión principal pasa a la venta.
UPDATE transactions s
SET fee_asset = x.moneda, fee_amount = x.total, updated_at = NOW()
FROM (SELECT venta_id, moneda, sum(cantidad) AS total FROM m022_pares WHERE principal GROUP BY 1, 2) x
WHERE s.id = x.venta_id;

-- 1b. Cada moneda secundaria, en una sola fila enlazada a su venta.
UPDATE transactions f
SET amount = x.total, amount_net = x.total, linked_tx_id = c.venta_id,
    notes = 'Fee en ' || c.moneda || ' para SELL ' || c.vendido, updated_at = NOW()
FROM m022_conserva c
JOIN (SELECT venta_id, moneda, sum(cantidad) AS total FROM m022_pares WHERE NOT principal GROUP BY 1, 2) x
  ON x.venta_id = c.venta_id AND x.moneda = c.moneda
WHERE f.id = c.fee_id;

-- Cada fila que desaparece y la transacción que la absorbe: la venta (moneda
-- principal) o la fila conservada de su moneda.
CREATE TEMP TABLE m022_destino AS
SELECT p.fee_id, CASE WHEN p.principal THEN p.venta_id ELSE c.fee_id END AS destino
FROM m022_pares p
LEFT JOIN m022_conserva c ON c.venta_id = p.venta_id AND c.moneda = p.moneda
WHERE p.fee_id NOT IN (SELECT fee_id FROM m022_conserva);

-- 1c. Filas en bruto y referencias del FIFO (consumos, lotes y déficits) pasan
-- a la transacción que absorbe la comisión. El FIFO queda como estaba y
-- coherente; el siguiente recálculo aplica el criterio nuevo.
UPDATE raw_transactions r SET transaction_id = d.destino FROM m022_destino d WHERE r.transaction_id = d.fee_id;
UPDATE fifo_lot_consumptions c SET consuming_transaction_id = d.destino FROM m022_destino d WHERE c.consuming_transaction_id = d.fee_id;
UPDATE fifo_lots l SET open_transaction_id = d.destino FROM m022_destino d WHERE l.open_transaction_id = d.fee_id;
UPDATE fifo_shortfalls s SET transaction_id = d.destino FROM m022_destino d WHERE s.transaction_id = d.fee_id;

-- 1d. Eliminar las filas de comisión ya integradas.
DELETE FROM transactions WHERE id IN (SELECT fee_id FROM m022_destino);

-- 2. Comisiones de compras en otra moneda: se enlazan a su compra.
UPDATE transactions f
SET linked_tx_id = b.id, updated_at = NOW()
FROM transactions b
WHERE f.operation_type = 'FEE_EXCHANGE'
  AND f.notes LIKE 'Fee en % para BUY %'
  AND f.linked_tx_id IS NULL
  AND b.operation_type = 'BUY' AND b.wallet_id = f.wallet_id AND b.timestamp = f.timestamp
  AND (SELECT count(*) FROM transactions o
       WHERE o.wallet_id = f.wallet_id AND o.timestamp = f.timestamp
         AND o.operation_type IN ('BUY', 'BUY_FIAT', 'BUY_CRYPTO', 'SELL', 'SELL_FIAT', 'SELL_CRYPTO')) = 1;

DROP TABLE m022_pares, m022_conserva, m022_destino;
