-- 023 — Precio del momento de las transmisiones (#599).
-- Caché de precios por activo y minuto (price_momento) y, en cada consumo del
-- FIFO, cómo se valoró: precio del momento, «el mayor» de los dos lados de una
-- permuta (art. 37.1.h LIRPF) o precio del día como respaldo. Las columnas
-- nuevas quedan vacías hasta el siguiente recálculo del FIFO.
-- Idempotente. Reversión: migrations/down/023_precio_momento.sql
CREATE TABLE IF NOT EXISTS price_momento (
  asset      TEXT NOT NULL CHECK (char_length(asset) <= 32),
  momento    TIMESTAMPTZ NOT NULL,
  price_eur  NUMERIC(38, 18) NOT NULL CHECK (price_eur > 0),
  fuente     TEXT NOT NULL CHECK (fuente IN ('1m', '1h', '1d')),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (asset, momento)
);

ALTER TABLE fifo_lot_consumptions
  ADD COLUMN IF NOT EXISTS valoracion TEXT CHECK (valoracion IN ('momento', 'mayor', 'diario')),
  ADD COLUMN IF NOT EXISTS valor_entregado_eur NUMERIC(38, 18),
  ADD COLUMN IF NOT EXISTS valor_recibido_eur NUMERIC(38, 18);
