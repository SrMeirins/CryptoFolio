-- Datos sintéticos para la prueba de humo de consola (#201). Nada real: un
-- depósito, compras de dos activos (BTC en dos lotes), una venta que consume
-- ambos lotes (varios eventos fiscales de la misma operación) y una recompensa.
WITH w AS (SELECT id FROM wallets WHERE name = 'Binance Spot')
INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount, wallet_id, account)
SELECT v.op::operation_type, v.ts::timestamptz, v.asset, v.amount, v.amount, v.cost_asset, v.cost_amount, w.id, 'Spot'
FROM w, (VALUES
  ('DEPOSIT_FIAT',   '2024-01-05T10:00:00Z', 'EUR', 2000::numeric, NULL,  NULL::numeric),
  ('BUY',            '2024-01-10T10:00:00Z', 'BTC', 0.01,          'EUR', 400),
  ('BUY',            '2024-02-10T10:00:00Z', 'BTC', 0.01,          'EUR', 450),
  ('BUY',            '2024-03-01T10:00:00Z', 'XRP', 300,           'EUR', 150),
  ('SELL',           '2025-03-01T10:00:00Z', 'BTC', 0.015,         'EUR', 700),
  ('STAKING_REWARD', '2025-04-01T10:00:00Z', 'XRP', 5,             NULL,  NULL)
) AS v(op, ts, asset, amount, cost_asset, cost_amount);
