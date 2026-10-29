import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { runFifoEngine } from '../../modules/fifo/engine';
import { sendInternalError } from '../../middleware/errorHandler';
import { BackupFormatError, buildBackup, openBackup, validatePassword } from '../../modules/backup/backupEnvelope';
import { countRows, readBackupData } from '../../modules/backup/backupTables';
import { listSnapshots, restoreBackup, revertSnapshot } from '../../modules/backup/backupRestore';
import { requireConfirm, sendZodError } from './settingsShared';

// Copias de seguridad (#453): exportar (en claro o cifrada), ver qué trae una
// copia, restaurarla y volver al estado anterior.

const router = Router();

const passwordSchema = z.string().max(1024).optional();
const exportSchema = z.object({ password: passwordSchema }).strict();
const openSchema = z.object({ backup: z.unknown(), password: passwordSchema });
const restoreSchema = openSchema.extend({ confirm: z.literal(true, { error: 'Esta operación requiere { "confirm": true } en el body' }) });

// Derivar la clave usa 64 MiB y unos cientos de ms: una operación a la vez.
let busy = false;
async function exclusive(res: Response, fn: () => Promise<void>): Promise<void> {
  if (busy) {
    res.status(429).json({ error: 'Ya hay una copia en curso. Espera a que termine.' });
    return;
  }
  busy = true;
  try { await fn(); } finally { busy = false; }
}

// Errores de la copia: mensaje claro y sin detalles internos. Un valor que
// Postgres no acepta (tipo o restricción) también es una copia que no encaja.
function sendBackupError(res: Response, err: unknown, context: string): void {
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

// ── GET /api/settings/backup ──────────────────────────────────────────────
// Copia en claro. La usa también la copia semanal de la app de escritorio.
router.get('/backup', async (_req: Request, res: Response) => {
  res.json(await buildBackup(await readBackupData(db)));
});

// ── POST /api/settings/backup ─────────────────────────────────────────────
// Con { password }, cifrada. La contraseña viaja en el cuerpo, nunca en la URL.
router.post('/backup', async (req: Request, res: Response) => {
  const v = exportSchema.safeParse(req.body ?? {});
  if (!v.success) { sendZodError(res, v.error); return; }
  const invalid = validatePassword(v.data.password);
  if (invalid) { res.status(400).json({ error: invalid }); return; }
  await exclusive(res, async () => {
    res.json(await buildBackup(await readBackupData(db), v.data.password));
  });
});

// ── POST /api/settings/backup/preview ─────────────────────────────────────
// Qué trae una copia frente a lo que hay ahora. No cambia nada.
router.post('/backup/preview', async (req: Request, res: Response) => {
  const v = openSchema.safeParse(req.body);
  if (!v.success) { sendZodError(res, v.error); return; }
  await exclusive(res, async () => {
    try {
      const opened = await openBackup(v.data.backup, v.data.password);
      const current = countRows(await readBackupData(db));
      res.json({ schema: opened.schema, exported_at: opened.exported_at, encrypted: opened.encrypted, counts: opened.counts, current });
    } catch (err) {
      sendBackupError(res, err, '/backup/preview');
    }
  });
});

// ── POST /api/settings/backup/restore ─────────────────────────────────────
// Sustituye los datos por los de la copia tras guardar el estado actual.
router.post('/backup/restore', async (req: Request, res: Response) => {
  const v = restoreSchema.safeParse(req.body);
  if (!v.success) { sendZodError(res, v.error); return; }
  await exclusive(res, async () => {
    try {
      const opened = await openBackup(v.data.backup, v.data.password);
      const { snapshotId } = await db.transaction(client => restoreBackup(client, opened.data));
      const fifo = await runFifoEngine().catch(() => null);
      res.json({ restored: opened.counts, snapshotId, fifo: fifo !== null });
    } catch (err) {
      sendBackupError(res, err, '/backup/restore');
    }
  });
});

// ── GET /api/settings/backup/snapshots ────────────────────────────────────
router.get('/backup/snapshots', async (_req: Request, res: Response) => {
  res.json(await listSnapshots(db));
});

// ── POST /api/settings/backup/snapshots/:id/revert ────────────────────────
const idSchema = z.uuid();
router.post('/backup/snapshots/:id/revert', async (req: Request, res: Response) => {
  if (!requireConfirm(res, req.body)) return;
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: 'Identificador de copia inválido' }); return; }
  await exclusive(res, async () => {
    try {
      const found = await db.transaction(client => revertSnapshot(client, id.data));
      if (!found) { res.status(404).json({ error: 'Esa copia previa ya no existe' }); return; }
      const fifo = await runFifoEngine().catch(() => null);
      res.json({ reverted: true, fifo: fifo !== null });
    } catch (err) {
      sendBackupError(res, err, '/backup/snapshots/revert');
    }
  });
});

export default router;
