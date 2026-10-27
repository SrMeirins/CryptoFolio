-- 016 — Filas originales del CSV (#374): cada hash guarda su fila tal como
-- venía en el archivo (Binance o Bitvavo), sin el «User ID». NULL = importada
-- antes de este cambio (solo se puede contar). Idempotente.
-- Reversión: migrations/down/016_filas_originales.sql
ALTER TABLE raw_transactions ADD COLUMN IF NOT EXISTS original_row JSONB;

ALTER TABLE raw_transactions DROP CONSTRAINT IF EXISTS chk_raw_transactions_original_row;
ALTER TABLE raw_transactions ADD CONSTRAINT chk_raw_transactions_original_row
  CHECK (original_row IS NULL OR (jsonb_typeof(original_row) = 'object' AND NOT original_row ? 'User ID'));
