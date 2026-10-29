-- Reversión de 016: quita las filas originales del CSV. Las transacciones y los
-- hashes se conservan; el detalle vuelve a mostrar solo el recuento.
ALTER TABLE raw_transactions DROP CONSTRAINT IF EXISTS chk_raw_transactions_original_row;
ALTER TABLE raw_transactions DROP COLUMN IF EXISTS original_row;
