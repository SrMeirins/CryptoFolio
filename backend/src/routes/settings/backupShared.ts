import { Response } from 'express';
import { db } from '../../db/client';
import { runFifoEngine } from '../../modules/fifo/engine';
import { sendInternalError } from '../../middleware/errorHandler';
import { BackupFormatError, type OpenedBackup } from '../../modules/backup/backupEnvelope';
import { restoreBackup } from '../../modules/backup/backupRestore';

// Piezas comunes de las rutas de copias manuales (#453) y automáticas (#454).

// Derivar una clave con Argon2id usa 64 MiB y unos cientos de ms, y restaurar
// sustituye todos los datos: una operación de copia a la vez.
let busy = false;
export async function exclusive(res: Response, fn: () => Promise<void>): Promise<void> {
  if (busy) {
    res.status(429).json({ error: 'Ya hay una copia en curso. Espera a que termine.' });
    return;
  }
  busy = true;
  try { await fn(); } finally { busy = false; }
}

// Errores de la copia: mensaje claro y sin detalles internos. Un valor que
// Postgres no acepta (tipo o restricción) también es una copia que no encaja.
export function sendBackupError(res: Response, err: unknown, context: string): void {
  if (err instanceof BackupFormatError) {
    res.status(err.code === 'version' ? 409 : 400).json({ error: err.message, code: err.code });
    return;
  }
  const pgCode = (err as { code?: unknown }).code;
  if (typeof pgCode === 'string' && /^2[23]/.test(pgCode)) {
    res.status(400).json({ error: 'Los datos de la copia no encajan con la base de datos. No se ha cambiado nada.', code: 'datos' });
    return;
  }
  sendInternalError(res, err, context, 'No se pudo completar la operación con la copia');
}

/** Restaura una copia ya abierta (con su estado previo) y recalcula el FIFO. */
export async function restoreAndRecalc(opened: OpenedBackup) {
  const { snapshotId } = await db.transaction(client => restoreBackup(client, opened.data));
  const fifo = await runFifoEngine().catch(() => null);
  return { restored: opened.counts, snapshotId, fifo: fifo !== null };
}
