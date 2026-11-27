-- 030 — Claves de API de servicios que no son una red (versión 1.0): la de
-- CoinGecko, que hasta ahora solo se podía poner en el .env y por tanto no
-- existía en la aplicación de escritorio. Cifrada como network_api_keys.
-- Idempotente. Reversión: migrations/down/030_claves_servicio.sql
CREATE TABLE IF NOT EXISTS claves_servicio (
  servicio           TEXT PRIMARY KEY CHECK (servicio IN ('coingecko')),
  api_key_encrypted  BYTEA NOT NULL,
  api_key_iv         BYTEA NOT NULL,
  plan               TEXT NOT NULL DEFAULT 'demo' CHECK (plan IN ('demo', 'pro')),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
