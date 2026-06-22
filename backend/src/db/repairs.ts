import { db } from './client';

/**
 * Auto-reparaciones de datos que se ejecutan en cada arranque (no son
 * migraciones de esquema: corrigen inconsistencias que el importer de CSV
 * puede volver a introducir en futuras importaciones, así que deben repetirse
 * siempre, no aplicarse una sola vez). Idempotentes y baratas en una tabla
 * de un solo usuario.
 */
export async function runStartupRepairs(): Promise<void> {
  // Limpiar destination_pending=TRUE en transacciones que ya no son WITHDRAW
  // (datos corruptos de ediciones previas o upgrades del importer).
  const staleRes = await db.query(
    `UPDATE transactions SET destination_pending = FALSE
     WHERE destination_pending = TRUE AND operation_type != 'WITHDRAW'`
  );
  if (staleRes.rowCount && staleRes.rowCount > 0) {
    console.log(`[STARTUP] Limpiados ${staleRes.rowCount} registros con destination_pending incorrecto`);
  }

  // Convertir automáticamente WITHDRAW+destination_pending=TRUE que en el CSV
  // original eran "Asset Recovery" o "Token Swap - Distribution" negativos.
  // Binance fuerza estos retiros (delisting): no van a ninguna wallet, son LOST.
  const forcedLostRes = await db.query(
    `UPDATE transactions t
     SET operation_type        = 'LOST'::operation_type,
         destination_wallet_id = NULL,
         destination_pending   = FALSE,
         notes = COALESCE(t.notes, rt.operation || ' — activo retirado por Binance')
     FROM raw_transactions rt
     WHERE rt.transaction_id = t.id
       AND t.operation_type = 'WITHDRAW'
       AND t.destination_pending = TRUE
       AND rt.operation IN ('Asset Recovery', 'Token Swap - Distribution')
       AND rt.change < 0`
  );
  if (forcedLostRes.rowCount && forcedLostRes.rowCount > 0) {
    console.log(`[STARTUP] Reclasificados ${forcedLostRes.rowCount} retiros forzados (Asset Recovery/Token Swap) → LOST`);
  }
}
