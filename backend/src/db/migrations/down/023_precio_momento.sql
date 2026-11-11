-- Reversión de 023: quita la caché de precios del momento y las columnas de
-- valoración de los consumos. Hay que recalcular el FIFO después con el código
-- anterior para volver al precio del día.
ALTER TABLE fifo_lot_consumptions
  DROP COLUMN IF EXISTS valor_recibido_eur,
  DROP COLUMN IF EXISTS valor_entregado_eur,
  DROP COLUMN IF EXISTS valoracion;
DROP TABLE IF EXISTS price_momento;
