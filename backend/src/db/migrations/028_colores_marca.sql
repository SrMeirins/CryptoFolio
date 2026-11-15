-- 028 — Colores de marca de las wallets nativas (#525). Todas las subcuentas
-- de Binance llevan el amarillo de Binance y Bitvavo su azul, para que en
-- Portfolio se lean como un mismo exchange; las subcuentas se distinguen por
-- su nombre. El color de las wallets del sistema deja de ser editable.
-- Idempotente. Reversión: migrations/down/028_colores_marca.sql
UPDATE wallets SET color = '#F0B90B' WHERE is_system AND name LIKE 'Binance %' AND color <> '#F0B90B';
UPDATE wallets SET color = '#273A75' WHERE is_system AND name = 'Bitvavo' AND color <> '#273A75';
