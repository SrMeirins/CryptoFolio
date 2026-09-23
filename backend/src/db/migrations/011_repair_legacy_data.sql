-- ============================================================
-- Migración 011_repair_legacy_data
-- Qué: corrige 2 inconsistencias en transacciones ya importadas.
-- Por qué: son parches de datos creados por versiones antiguas de la app,
--          antes de que existieran las protecciones actuales — el endpoint
--          de edición ya limpia destination_pending al cambiar el tipo
--          (routes/transactions.ts), y el parser ya importa Asset
--          Recovery/Token Swap negativos como LOST directamente
--          (modules/csv/parser.ts). No puede repetirse con el código
--          actual, por eso es una migración de una sola vez y no lógica de
--          arranque recurrente.
-- ============================================================

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
