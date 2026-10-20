-- 010 — Revisiones de cobertura (#328): huecos entre importaciones o el tramo
-- pendiente hasta hoy que el usuario marca como «no operé en ese periodo».
-- Una revisión cubre cualquier hueco que quede dentro de [desde, hasta].
-- Idempotente. Reversión: migrations/down/010_cobertura_revisiones.sql
CREATE TABLE IF NOT EXISTS cobertura_revisiones (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  exchange     TEXT        NOT NULL CHECK (exchange IN ('binance', 'bitvavo')),
  tipo         TEXT        NOT NULL CHECK (tipo IN ('hueco', 'pendiente')),
  desde        DATE        NOT NULL,
  hasta        DATE        NOT NULL CHECK (hasta >= desde),
  revisado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cobertura_revisiones_exchange ON cobertura_revisiones(exchange);
