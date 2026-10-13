-- Reversión de 003: elimina el tipo USD por EUR de los lotes. Los importes en
-- EUR no se ven afectados.
ALTER TABLE fifo_lots DROP CONSTRAINT IF EXISTS chk_fifo_lots_usd_per_eur_pos;
ALTER TABLE fifo_lots DROP COLUMN IF EXISTS usd_per_eur;
