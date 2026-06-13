-- Añade columna binance_eth_pair como proxy propio (distinto de binance_btc_pair)
ALTER TABLE asset_metadata ADD COLUMN IF NOT EXISTS binance_eth_pair TEXT;

-- BETH: mover BETHETH de binance_btc_pair (hack) a binance_eth_pair (correcto)
INSERT INTO asset_metadata (symbol, name, coingecko_id, is_stablecoin, binance_eth_pair, price_source)
VALUES ('BETH', 'Binance ETH Staking', NULL, FALSE, 'BETHETH', 'eth_proxy')
ON CONFLICT (symbol) DO UPDATE SET
  binance_btc_pair = NULL,
  binance_eth_pair = 'BETHETH',
  price_source     = 'eth_proxy';
