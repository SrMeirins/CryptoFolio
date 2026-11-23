-- 029 — Alertas de precio y de cartera (#519). Una alerta de precio vigila un
-- activo por encima o por debajo de un precio (en EUR o USD), una vez o cada
-- vez que lo cruza (se rearma al volver al otro lado); la de cartera, un
-- cambio del valor en 24 h mayor que un %. Solo se guarda el último disparo:
-- los avisos de la campana se calculan a partir de él.
-- Idempotente. Reversión: migrations/down/029_alertas.sql
CREATE TABLE IF NOT EXISTS alertas (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo              TEXT NOT NULL CHECK (tipo IN ('precio', 'cartera')),
  activo            TEXT REFERENCES asset_metadata(symbol) ON DELETE CASCADE,
  sentido           TEXT CHECK (sentido IN ('por_encima', 'por_debajo')),
  precio            NUMERIC(38, 10) CHECK (precio IS NULL OR precio > 0),
  moneda            TEXT NOT NULL DEFAULT 'EUR' CHECK (moneda IN ('EUR', 'USD')),
  repeticion        TEXT NOT NULL DEFAULT 'una_vez' CHECK (repeticion IN ('una_vez', 'cada_vez')),
  umbral_pct        NUMERIC(10, 4) CHECK (umbral_pct IS NULL OR (umbral_pct > 0 AND umbral_pct <= 1000)),
  activa            BOOLEAN NOT NULL DEFAULT TRUE,
  -- «Cada vez»: FALSE tras disparar hasta que el precio vuelve al otro lado.
  armada            BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_disparo_at TIMESTAMPTZ,
  -- Precio (o % en la de cartera) al dispararse.
  ultimo_valor      NUMERIC(38, 10),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT alertas_campos_tipo CHECK (
    (tipo = 'precio' AND activo IS NOT NULL AND sentido IS NOT NULL AND precio IS NOT NULL AND umbral_pct IS NULL)
    OR (tipo = 'cartera' AND activo IS NULL AND sentido IS NULL AND precio IS NULL AND umbral_pct IS NOT NULL)
  )
);
-- Una sola alerta de cartera.
CREATE UNIQUE INDEX IF NOT EXISTS alertas_una_cartera ON alertas (tipo) WHERE tipo = 'cartera';
CREATE INDEX IF NOT EXISTS alertas_activo_idx ON alertas (activo) WHERE activo IS NOT NULL;
