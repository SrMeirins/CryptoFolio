-- ============================================================
-- Migración 010_raw_transactions_fk
-- Qué: añade índice y FK (ON DELETE SET NULL) a
--      raw_transactions.transaction_id.
-- Por qué: esa columna se usaba como FK de facto en varias queries
--          (routes/settings.ts, modules/csv/importer.ts) pero sin
--          constraint ni índice. Al borrar una transacción importada
--          (DELETE FROM transactions), la referencia quedaba colgante
--          (apuntando a un id que ya no existe). ON DELETE SET NULL la
--          limpia automáticamente en vez de dejarla huérfana.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_raw_transactions_tx ON raw_transactions(transaction_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'raw_transactions_transaction_id_fkey'
  ) THEN
    ALTER TABLE raw_transactions
      ADD CONSTRAINT raw_transactions_transaction_id_fkey
      FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL;
  END IF;
END $$;
