-- Reversión de 017: quita la comisión incluida en el coste. Solo era
-- informativa: el coste y el FIFO no cambian.
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS chk_transactions_included_fee;
ALTER TABLE transactions DROP COLUMN IF EXISTS included_fee_amount;
ALTER TABLE transactions DROP COLUMN IF EXISTS included_fee_asset;
