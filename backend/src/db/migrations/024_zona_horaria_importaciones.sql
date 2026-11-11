-- 024 — Zona horaria de cada importación (#599). El CSV de Binance no indica
-- en qué zona horaria se exportó su columna «Time»; la importación la detecta
-- y se confirma, y aquí se guarda, en horas respecto de UTC (UTC+2 = 2), para
-- poder corregirla después. Las importaciones anteriores se leyeron como UTC.
-- Idempotente. Reversión: migrations/down/024_zona_horaria_importaciones.sql
ALTER TABLE csv_imports
  ADD COLUMN IF NOT EXISTS desfase_horas SMALLINT NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE csv_imports ADD CONSTRAINT chk_csv_imports_desfase_horas CHECK (desfase_horas BETWEEN -12 AND 14);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
