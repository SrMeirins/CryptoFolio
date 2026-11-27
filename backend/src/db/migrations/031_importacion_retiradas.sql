-- 031 — Importación complementaria de retiradas de Binance (#548): csv_imports
-- distingue el historial de transacciones del de retiradas, que no crea
-- operaciones y solo aporta dirección, red y hash a retiros ya importados.
-- `periodo_desde`/`periodo_hasta` guardan el rango de fechas del historial de
-- retiradas (las de transacciones lo sacan de sus operaciones). Idempotente.
-- Reversión: migrations/down/031_importacion_retiradas.sql
ALTER TABLE csv_imports
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'transacciones',
  ADD COLUMN IF NOT EXISTS periodo_desde DATE,
  ADD COLUMN IF NOT EXISTS periodo_hasta DATE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_csv_imports_tipo') THEN
    ALTER TABLE csv_imports ADD CONSTRAINT chk_csv_imports_tipo CHECK (tipo IN ('transacciones', 'retiradas'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_csv_imports_periodo') THEN
    ALTER TABLE csv_imports ADD CONSTRAINT chk_csv_imports_periodo
      CHECK (periodo_hasta IS NULL OR periodo_desde IS NULL OR periodo_hasta >= periodo_desde);
  END IF;
END $$;
