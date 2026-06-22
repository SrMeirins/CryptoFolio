-- Parche histórico de una sola vez: corrige datos creados por versiones
-- antiguas de la app, antes de que existieran las protecciones actuales
-- (el endpoint de edición ya limpia destination_pending al cambiar el tipo,
-- y el parser ya importa Asset Recovery/Token Swap negativos como LOST
-- directamente) — no es código que deba repetirse en cada arranque.

-- Limpiar destination_pending=TRUE en transacciones que ya no son WITHDRAW
-- (datos corruptos de ediciones hechas antes de que el endpoint de edición
-- limpiara este campo automáticamente).
UPDATE transactions SET destination_pending = FALSE
WHERE destination_pending = TRUE AND operation_type != 'WITHDRAW';

-- Reclasificar WITHDRAW+destination_pending=TRUE que en el CSV original eran
-- "Asset Recovery" o "Token Swap - Distribution" negativos (importados antes
-- de que el parser los mapeara directamente a LOST). Binance fuerza estos
-- retiros (delisting): no van a ninguna wallet, son pérdida patrimonial.
UPDATE transactions t
SET operation_type        = 'LOST'::operation_type,
    destination_wallet_id = NULL,
    destination_pending   = FALSE,
    notes = COALESCE(t.notes, rt.operation || ' — activo retirado por Binance')
FROM raw_transactions rt
WHERE rt.transaction_id = t.id
  AND t.operation_type = 'WITHDRAW'
  AND t.destination_pending = TRUE
  AND rt.operation IN ('Asset Recovery', 'Token Swap - Distribution')
  AND rt.change < 0;
