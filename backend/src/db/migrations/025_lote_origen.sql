-- 025 — Lote de origen de cada traslado (#544). Al trasladar unidades entre
-- wallets propias, el FIFO crea un lote nuevo en la de destino; aquí se guarda
-- de qué lote vienen, para seguir unas unidades a través de wallets (p. ej.,
-- saber si las de un rendimiento ya se transmitieron). Los lotes son datos
-- derivados: la columna se rellena en el siguiente recálculo del FIFO.
-- Idempotente. Reversión: migrations/down/025_lote_origen.sql
ALTER TABLE fifo_lots
  ADD COLUMN IF NOT EXISTS origin_lot_id UUID REFERENCES fifo_lots(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fifo_lots_origin ON fifo_lots(origin_lot_id) WHERE origin_lot_id IS NOT NULL;
