-- ============================================================
-- Migración 019_numeric_precision_18_decimales
-- Qué: amplía NUMERIC(30,10) → NUMERIC(38,18) en las 19 columnas de
--      cantidad/precio de transactions, fifo_lots, fifo_lot_consumptions,
--      raw_transactions, price_cache y wallet_addresses.
-- Por qué: escala 10 trunca los 8 dígitos menos significativos de tokens
--          ERC-20 con 18 decimales en cada cálculo/inserción. Ampliar la
--          escala es seguro — nunca trunca valores ya guardados, solo evita
--          truncar en el futuro (no recupera precisión ya perdida).
-- ============================================================

-- Ambas vistas dependen de columnas afectadas (fifo_lots, fifo_lot_consumptions)
-- — hay que soltarlas antes del ALTER TYPE y recrearlas igual después.
DROP VIEW IF EXISTS v_portfolio_current;
DROP VIEW IF EXISTS v_fiscal_year;

ALTER TABLE wallet_addresses  ALTER COLUMN last_known_balance    TYPE NUMERIC(38, 18);

ALTER TABLE raw_transactions  ALTER COLUMN change                TYPE NUMERIC(38, 18);

ALTER TABLE transactions
  ALTER COLUMN amount        TYPE NUMERIC(38, 18),
  ALTER COLUMN amount_net    TYPE NUMERIC(38, 18),
  ALTER COLUMN cost_amount   TYPE NUMERIC(38, 18),
  ALTER COLUMN price_per_unit TYPE NUMERIC(38, 18),
  ALTER COLUMN price_eur     TYPE NUMERIC(38, 18),
  ALTER COLUMN fee_amount    TYPE NUMERIC(38, 18),
  ALTER COLUMN fee_eur       TYPE NUMERIC(38, 18);

ALTER TABLE fifo_lots
  ALTER COLUMN quantity_original  TYPE NUMERIC(38, 18),
  ALTER COLUMN quantity_remaining TYPE NUMERIC(38, 18),
  ALTER COLUMN cost_basis_eur     TYPE NUMERIC(38, 18),
  ALTER COLUMN price_per_unit_eur TYPE NUMERIC(38, 18),
  ALTER COLUMN fee_eur            TYPE NUMERIC(38, 18);

ALTER TABLE fifo_lot_consumptions
  ALTER COLUMN quantity_consumed       TYPE NUMERIC(38, 18),
  ALTER COLUMN cost_basis_consumed_eur TYPE NUMERIC(38, 18),
  ALTER COLUMN proceeds_eur            TYPE NUMERIC(38, 18),
  ALTER COLUMN gain_loss_eur           TYPE NUMERIC(38, 18);

ALTER TABLE price_cache        ALTER COLUMN price_eur              TYPE NUMERIC(38, 18);

CREATE OR REPLACE VIEW v_portfolio_current AS
SELECT
  fl.asset,
  fl.wallet_id,
  w.name  AS wallet_name,
  w.color AS wallet_color,
  w.type  AS wallet_kind,
  SUM(fl.quantity_remaining) AS quantity,
  SUM(fl.cost_basis_eur * (fl.quantity_remaining / NULLIF(fl.quantity_original, 0))) AS cost_basis_eur,
  AVG(fl.price_per_unit_eur) AS avg_buy_price_eur
FROM fifo_lots fl
JOIN wallets w ON w.id = fl.wallet_id
WHERE fl.is_closed = FALSE AND fl.quantity_remaining > 0
GROUP BY fl.asset, fl.wallet_id, w.name, w.color, w.type
ORDER BY fl.asset, w.name;

CREATE OR REPLACE VIEW v_fiscal_year AS
SELECT
  EXTRACT(YEAR FROM consumed_at)::INTEGER AS fiscal_year,
  SUM(gain_loss_eur) AS total_gain_loss_eur,
  SUM(CASE WHEN gain_loss_eur > 0 THEN gain_loss_eur ELSE 0 END) AS total_gains_eur,
  SUM(CASE WHEN gain_loss_eur < 0 THEN gain_loss_eur ELSE 0 END) AS total_losses_eur,
  COUNT(*) AS num_operations
FROM fifo_lot_consumptions
WHERE fiscal_event_type != 'NONE'
GROUP BY fiscal_year
ORDER BY fiscal_year;
