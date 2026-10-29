-- 017 — Comisión incluida en el coste (#415): la que el exchange ya suma al
-- importe pagado (Bitvavo). Solo informativa: el motor FIFO no la lee, así que
-- no se cuenta dos veces. Las compras ya importadas se completan desde su fila
-- original del CSV (#374). Idempotente.
-- Reversión: migrations/down/017_comision_incluida.sql
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS included_fee_asset TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS included_fee_amount NUMERIC(38, 18);

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS chk_transactions_included_fee;
ALTER TABLE transactions ADD CONSTRAINT chk_transactions_included_fee CHECK (
  (included_fee_asset IS NULL) = (included_fee_amount IS NULL)
  AND (included_fee_amount IS NULL OR included_fee_amount > 0)
  AND (included_fee_asset IS NULL OR char_length(included_fee_asset) <= 32)
);

UPDATE transactions t
SET included_fee_asset  = upper(rt.original_row->>'Fee currency'),
    included_fee_amount = (rt.original_row->>'Fee amount')::numeric
FROM raw_transactions rt
JOIN csv_imports ci ON ci.id = rt.import_id
WHERE rt.transaction_id = t.id
  AND ci.exchange = 'bitvavo'
  AND rt.original_row->>'Type' = 'buy'
  AND upper(rt.original_row->>'Fee currency') = upper(rt.original_row->>'Received / Paid Currency')
  AND rt.original_row->>'Fee amount' ~ '^[0-9]+(\.[0-9]+)?$'
  AND (rt.original_row->>'Fee amount')::numeric > 0
  AND t.fee_asset IS NULL
  AND t.included_fee_amount IS NULL;
