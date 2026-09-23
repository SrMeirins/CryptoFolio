-- ============================================================
-- Migración 014_csv_imports_exchange
-- Qué: añade columna 'exchange' a csv_imports (default 'binance' para
--      imports históricos, que todos eran de Binance).
-- Por qué: soporte multi-exchange (Bitvavo). La detección de gaps/solapes
--          entre imports debe acotarse al mismo exchange — Binance y
--          Bitvavo son historiales independientes, comparar fechas entre
--          ambos generaría falsos positivos de "gap sin datos".
-- ============================================================
ALTER TABLE csv_imports
  ADD COLUMN IF NOT EXISTS exchange TEXT NOT NULL DEFAULT 'binance';
