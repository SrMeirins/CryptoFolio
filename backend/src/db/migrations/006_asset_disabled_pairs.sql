-- 006 — Pares de Binance que el usuario quitó a mano en Ajustes (#277). El
-- relleno automático de pares (EUR, USDT, BTC, ETH) no vuelve a añadirlos.
-- Valores: 'eur', 'usdt', 'btc', 'eth'. Idempotente.
-- Reversión: migrations/down/006_asset_disabled_pairs.sql
ALTER TABLE asset_metadata
  ADD COLUMN IF NOT EXISTS disabled_pairs TEXT[] NOT NULL DEFAULT '{}';
