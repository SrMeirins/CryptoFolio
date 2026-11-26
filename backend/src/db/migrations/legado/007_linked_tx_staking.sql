-- ============================================================
-- Migración 007_linked_tx_staking
-- Qué: añade la columna linked_tx_id a transactions y el valor
--      STAKING_UNLOCK al enum operation_type.
-- Por qué: cada "redemption" (desbloqueo) de staking necesita saber a qué
--          "purchase" (bloqueo, STAKING_LOCK) corresponde, para poder
--          calcular el rendimiento real (diferencia entre lo bloqueado y lo
--          devuelto). linked_tx_id es esa relación; el importer la rellena
--          automáticamente al detectar el par lock/unlock.
-- ============================================================
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS linked_tx_id UUID REFERENCES transactions(id) ON DELETE SET NULL;
ALTER TYPE operation_type ADD VALUE IF NOT EXISTS 'STAKING_UNLOCK' AFTER 'STAKING_LOCK';
