-- 013 — Edición de transacciones importadas (#378): copia de los campos tal
-- como se importaron, guardada en la primera edición. NULL = no modificada.
-- Solo para importadas (una manual no tiene original). Idempotente.
-- Reversión: migrations/down/013_transacciones_editadas.sql
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS original_import JSONB;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS chk_transactions_original_import;
ALTER TABLE transactions ADD CONSTRAINT chk_transactions_original_import
  CHECK (original_import IS NULL OR (jsonb_typeof(original_import) = 'object' AND NOT manually_added));

-- Filtro «Editadas» del Historial: pocas filas, índice parcial.
CREATE INDEX IF NOT EXISTS idx_transactions_editadas ON transactions(timestamp) WHERE original_import IS NOT NULL;
