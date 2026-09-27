-- ============================================================
-- Migración 020_check_constraints
-- Qué: CHECK constraints como defensa en profundidad sobre cantidades y
--      coherencia de lotes FIFO. El motor actual ya los respeta en el camino
--      feliz; esto previene estados imposibles ante un futuro bug, script de
--      reparación o edición manual.
-- Por qué: sin esto, nada a nivel de BD impide quantity_remaining negativo,
--      mayor que quantity_original, o un lote cerrado con remanente positivo.
-- ============================================================

DO $$ BEGIN
  ALTER TABLE fifo_lots ADD CONSTRAINT chk_fifo_lots_qty_original_nonneg CHECK (quantity_original >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE fifo_lots ADD CONSTRAINT chk_fifo_lots_qty_remaining_nonneg CHECK (quantity_remaining >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE fifo_lots ADD CONSTRAINT chk_fifo_lots_qty_remaining_le_original CHECK (quantity_remaining <= quantity_original);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE fifo_lots ADD CONSTRAINT chk_fifo_lots_cost_basis_nonneg CHECK (cost_basis_eur >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE fifo_lots ADD CONSTRAINT chk_fifo_lots_price_nonneg CHECK (price_per_unit_eur >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE fifo_lots ADD CONSTRAINT chk_fifo_lots_fee_nonneg CHECK (fee_eur >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Lote cerrado no puede tener remanente relevante (mismo umbral que el motor: FIFO_DUST_EPSILON=1e-6).
DO $$ BEGIN
  ALTER TABLE fifo_lots ADD CONSTRAINT chk_fifo_lots_closed_no_remaining CHECK (NOT is_closed OR quantity_remaining <= 0.000001);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE fifo_lot_consumptions ADD CONSTRAINT chk_flc_qty_nonneg CHECK (quantity_consumed >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE fifo_lot_consumptions ADD CONSTRAINT chk_flc_cost_basis_nonneg CHECK (cost_basis_consumed_eur >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE fifo_lot_consumptions ADD CONSTRAINT chk_flc_proceeds_nonneg CHECK (proceeds_eur >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE transactions ADD CONSTRAINT chk_transactions_amount_nonneg CHECK (amount >= 0 AND amount_net >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE transactions ADD CONSTRAINT chk_transactions_cost_amount_nonneg CHECK (cost_amount IS NULL OR cost_amount >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE transactions ADD CONSTRAINT chk_transactions_fee_amount_nonneg CHECK (fee_amount IS NULL OR fee_amount >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
