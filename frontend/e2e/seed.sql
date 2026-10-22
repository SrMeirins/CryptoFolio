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

-- Una transacción manual, para recorrer con teclado su confirmación de borrado
-- (#351). La prueba solo la abre y la cancela: nunca borra.
INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount, wallet_id, account, manually_added, notes)
SELECT 'BUY', '2025-05-01T10:00:00Z', 'XRP', 10, 10, 'EUR', 5, id, 'Spot', TRUE, 'Compra manual de prueba'
FROM wallets WHERE name = 'Binance Spot';

-- Cierres diarios sintéticos (#359): la CI arranca el backend con
-- PRICE_SOURCES_OFFLINE=true, así que no descarga precios. Con estos cierres el
-- Dashboard muestra la evolución y el P&L (no se queda en «Preparando») y la
-- auditoría de accesibilidad cubre esos paneles. Precios inventados.
INSERT INTO price_close_madrid (asset, close_date, price_eur, source)
SELECT a.asset, d::date, a.base + a.step * (d::date - DATE '2024-01-05'), 'okx_1d'
FROM (VALUES ('BTC', 40000::numeric, 20::numeric), ('XRP', 0.5, 0.001)) AS a(asset, base, step),
     generate_series(DATE '2024-01-05', (NOW() AT TIME ZONE 'Europe/Madrid')::date, INTERVAL '1 day') AS d
ON CONFLICT (asset, close_date) DO NOTHING;
