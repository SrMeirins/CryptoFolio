-- 003 — Tipo USD por EUR de la fecha de apertura de cada lote FIFO (#174).
-- Paso "expand": columna nullable. Se rellena al recalcular el FIFO
-- (POST /api/fifo/run reconstruye todos los lotes). Queda nullable porque una
-- fecha sin tipo EUR/USDT disponible deja el lote sin coste en USD.
-- Idempotente; reflejada en schema.sql. Reversión en migrations/down/.
ALTER TABLE fifo_lots ADD COLUMN IF NOT EXISTS usd_per_eur NUMERIC(38, 18);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_fifo_lots_usd_per_eur_pos') THEN
    ALTER TABLE fifo_lots ADD CONSTRAINT chk_fifo_lots_usd_per_eur_pos CHECK (usd_per_eur IS NULL OR usd_per_eur > 0);
  END IF;
END $$;
