-- Reversión de 011: elimina el motivo de los fallos de verificación.
ALTER TABLE balance_sync_log DROP COLUMN IF EXISTS error;
