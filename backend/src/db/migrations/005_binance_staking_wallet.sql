INSERT INTO wallets (name, type, is_system, is_default, color)
VALUES ('Binance Staking', 'exchange', TRUE, FALSE, '#f59e0b')
ON CONFLICT (name) DO NOTHING;
