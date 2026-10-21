-- 011 — Motivo de los fallos de verificación on-chain (#336): hasta ahora solo
-- se guardaba status='error' y el mensaje se perdía, así que no se podía
-- explicar qué falla ni qué hacer. Columna nullable: compatible hacia atrás.
-- Idempotente. Reversión: migrations/down/011_sync_log_error.sql
ALTER TABLE balance_sync_log
  ADD COLUMN IF NOT EXISTS error TEXT CHECK (char_length(error) <= 500);
