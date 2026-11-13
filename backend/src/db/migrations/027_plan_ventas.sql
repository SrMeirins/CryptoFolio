-- 027 — Plan de ventas de fin de año (#546). Un plan por ejercicio: las ventas
-- que el usuario piensa hacer, con su wallet, cantidad y, si quiere, un precio
-- propio (sin él se usa el precio en vivo). El efecto fiscal no se guarda: se
-- calcula cada vez con el FIFO global y los precios del momento.
-- Idempotente. Reversión: migrations/down/027_plan_ventas.sql
CREATE TABLE IF NOT EXISTS plan_ventas (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ejercicio  INTEGER NOT NULL CHECK (ejercicio BETWEEN 2009 AND 2100),
  orden      INTEGER NOT NULL CHECK (orden >= 0),
  asset      TEXT NOT NULL CHECK (asset ~ '^[A-Z0-9]{1,20}$'),
  wallet_id  UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  cantidad   NUMERIC(38, 18) NOT NULL CHECK (cantidad > 0),
  -- Precio propio por unidad en EUR (una orden límite); NULL: precio en vivo.
  precio_eur NUMERIC(38, 10) CHECK (precio_eur IS NULL OR precio_eur > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT plan_ventas_orden_key UNIQUE (ejercicio, orden)
);
