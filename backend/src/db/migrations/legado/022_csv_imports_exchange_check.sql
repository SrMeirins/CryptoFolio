-- ============================================================
-- Migración 022_csv_imports_exchange_check
-- Qué: CHECK (exchange IN ('binance','bitvavo')) en csv_imports.
-- Por qué: la columna era TEXT libre; la validación de valores permitidos
--      solo vivía en TypeScript (exchanges.ts). Ampliar este CHECK es el
--      mismo mantenimiento que ya exige añadir un exchange nuevo en el código.
-- ============================================================

DO $$ BEGIN
  ALTER TABLE csv_imports ADD CONSTRAINT chk_csv_imports_exchange CHECK (exchange IN ('binance', 'bitvavo'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
