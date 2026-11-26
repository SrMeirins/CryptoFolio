-- ============================================================
-- Migración 023_fk_on_delete_restrict_explicito
-- Qué: hace explícito ON DELETE RESTRICT (ya era el comportamiento por
--      defecto de Postgres sin especificar) en 3 FK entre fifo_lots/
--      fifo_lot_consumptions/transactions.
-- Por qué: documentación como código — deja constancia de que bloquear el
--      borrado mientras haya dependientes es intencional (no CASCADE
--      silencioso). Sin cambio de comportamiento real.
-- ============================================================

ALTER TABLE fifo_lots
  DROP CONSTRAINT IF EXISTS fifo_lots_open_transaction_id_fkey,
  ADD CONSTRAINT fifo_lots_open_transaction_id_fkey
    FOREIGN KEY (open_transaction_id) REFERENCES transactions(id) ON DELETE RESTRICT;

ALTER TABLE fifo_lot_consumptions
  DROP CONSTRAINT IF EXISTS fifo_lot_consumptions_lot_id_fkey,
  ADD CONSTRAINT fifo_lot_consumptions_lot_id_fkey
    FOREIGN KEY (lot_id) REFERENCES fifo_lots(id) ON DELETE RESTRICT;

ALTER TABLE fifo_lot_consumptions
  DROP CONSTRAINT IF EXISTS fifo_lot_consumptions_consuming_transaction_id_fkey,
  ADD CONSTRAINT fifo_lot_consumptions_consuming_transaction_id_fkey
    FOREIGN KEY (consuming_transaction_id) REFERENCES transactions(id) ON DELETE RESTRICT;
