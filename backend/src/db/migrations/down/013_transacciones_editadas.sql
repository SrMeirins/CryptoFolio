-- Reversión de 013: quita la copia del original de las importadas editadas.
-- Las ediciones se conservan; solo se pierde la posibilidad de restaurarlas.
DROP INDEX IF EXISTS idx_transactions_editadas;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS chk_transactions_original_import;
ALTER TABLE transactions DROP COLUMN IF EXISTS original_import;
