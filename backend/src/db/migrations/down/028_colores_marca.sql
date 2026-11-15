-- Reversión de 028: los colores de fábrica de cada subcuenta de Binance.
UPDATE wallets SET color = '#E8892B' WHERE is_system AND name = 'Binance Cross Margin';
UPDATE wallets SET color = '#C8812B' WHERE is_system AND name = 'Binance Isolated Margin';
UPDATE wallets SET color = '#8B5CF6' WHERE is_system AND name = 'Binance Strategy';
UPDATE wallets SET color = '#f59e0b' WHERE is_system AND name = 'Binance Staking';
