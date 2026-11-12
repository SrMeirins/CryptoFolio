-- Reversión de 025: quita el lote de origen de los traslados.
DROP INDEX IF EXISTS idx_fifo_lots_origin;
ALTER TABLE fifo_lots DROP COLUMN IF EXISTS origin_lot_id;
