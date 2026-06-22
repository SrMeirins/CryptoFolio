-- ============================================================
-- Migración 003_eth_proxy_pair
-- Qué: añade la columna binance_eth_pair a asset_metadata (proxy de precio
--      vía un par cotizado en ETH, distinto de binance_btc_pair) y corrige
--      el activo BETH para usarla.
-- Por qué: BETH (Binance ETH Staking) no tiene par directo en EUR/USDT, solo
--          cotiza como BETHETH. Antes se reusaba binance_btc_pair como hack
--          para guardar ese par, lo cual era semánticamente incorrecto y
--          confundía la lógica de detección de precio en pairDetector.ts.
-- ============================================================
ALTER TABLE asset_metadata ADD COLUMN IF NOT EXISTS binance_eth_pair TEXT;

-- Mover BETH del hack (binance_btc_pair='BETHETH') al campo correcto
INSERT INTO asset_metadata (symbol, name, coingecko_id, is_stablecoin, binance_eth_pair, price_source)
VALUES ('BETH', 'Binance ETH Staking', NULL, FALSE, 'BETHETH', 'eth_proxy')
ON CONFLICT (symbol) DO UPDATE SET
  binance_btc_pair = NULL,
  binance_eth_pair = 'BETHETH',
  price_source     = 'eth_proxy';
