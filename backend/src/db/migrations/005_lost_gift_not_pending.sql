-- 005 — Las retiradas clasificadas como perdidas (LOST) o regalos (GIFT_SENT)
-- no tienen destino por definición, pero el importador las guardaba con
-- destination_pending = TRUE (#257). Sin efecto funcional (el motor FIFO y el
-- mantenimiento solo miran WITHDRAW), pero deja datos incoherentes.
-- Idempotente: solo toca filas LOST/GIFT_SENT que sigan marcadas; nunca las
-- WITHDRAW pendientes.
-- Reversión: migrations/down/005_lost_gift_not_pending.sql
UPDATE transactions
SET destination_pending = FALSE, updated_at = NOW()
WHERE operation_type IN ('LOST', 'GIFT_SENT')
  AND destination_pending = TRUE;
