-- 001 — Caché de precios de cierre diario a las 00:00 Europe/Madrid (#164).
-- Idempotente: en instalaciones nuevas schema.sql ya crea la tabla y el runner
-- aplica igualmente esta migración (ver migrations/README.md).
-- Reversión: migrations/down/001_price_close_madrid.sql
CREATE TABLE IF NOT EXISTS price_close_madrid (
  asset       TEXT NOT NULL,
  close_date  DATE NOT NULL,                 -- día local (Europe/Madrid) cuyo cierre representa
  price_eur   NUMERIC(38, 18) NOT NULL,      -- -1 = sin precio en ninguna fuente
  source      TEXT NOT NULL,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (asset, close_date),
  CONSTRAINT chk_price_close_madrid_source CHECK (source IN ('binance_1h', 'coingecko_daily', 'none')),
  CONSTRAINT chk_price_close_madrid_price CHECK (price_eur > 0 OR (price_eur = -1 AND source = 'none'))
);
