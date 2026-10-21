-- 012 — Fuentes de precio de respaldo (#337): CoinPaprika y OKX tras Binance y
-- CoinGecko. Guarda el id de CoinPaprika de cada activo (la búsqueda gasta cuota
-- mensual: se hace una vez) y admite sus cierres diarios. Idempotente.
-- Reversión: migrations/down/012_fuentes_respaldo.sql
ALTER TABLE asset_metadata ADD COLUMN IF NOT EXISTS coinpaprika_id TEXT CHECK (char_length(coinpaprika_id) <= 100);

ALTER TABLE price_close_madrid DROP CONSTRAINT IF EXISTS chk_price_close_madrid_source;
ALTER TABLE price_close_madrid ADD CONSTRAINT chk_price_close_madrid_source
  CHECK (source IN ('binance_1h', 'coingecko_daily', 'coinpaprika_daily', 'okx_1d', 'none'));
