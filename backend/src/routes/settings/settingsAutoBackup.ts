import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { buildBackup, openBackup, validatePassword } from '../../modules/backup/backupEnvelope';
import { autoBackupAvailability, lastAutoBackupFailure, runAutoBackup } from '../../modules/backup/autoBackup';
import { readAutoBackupSettings } from '../../modules/backup/autoBackupSettings';
import { autoBackupPath, listAutoBackups, readAutoBackup } from '../../modules/backup/autoBackupStore';
import { exclusive, restoreAndRecalc, sendBackupError } from './backupShared';
import { requireConfirm, sendZodError } from './settingsShared';

// Copias automáticas (#454): estado y lista, hacer una ahora, descargarla
// recifrada con una contraseña (para llevarla a otro equipo) y restaurarla.
// La ruta de la carpeta no sale nunca en las respuestas.

const router = Router();

// ── GET /api/settings/backup/auto ─────────────────────────────────────────
router.get('/backup/auto', async (_req: Request, res: Response) => {
  const av = autoBackupAvailability();
  const settings = await readAutoBackupSettings(db);
  const files = av.available ? await listAutoBackups(av.dir).catch(() => []) : [];
  res.json({
    available: av.available,
    reason: av.available ? null : av.reason,
    settings,
    files,
    lastFailure: lastAutoBackupFailure(),
  });
});

// ── POST /api/settings/backup/auto/run ────────────────────────────────────
router.post('/backup/auto/run', async (_req: Request, res: Response) => {
  const av = autoBackupAvailability();
  if (!av.available) { res.status(409).json({ error: 'Las copias automáticas no están disponibles en este equipo.', code: av.reason }); return; }
  try {
    const { name, rotated } = await runAutoBackup();
    res.json({ name, rotated: rotated.length });
  } catch {
    res.status(500).json({ error: lastAutoBackupFailure()?.message ?? 'No se pudo hacer la copia.' });
  }
});

// Abre una copia automática con la clave del equipo. Responde y devuelve null si no se puede.
async function openAuto(req: Request, res: Response) {
  const av = autoBackupAvailability();
  if (!av.available) { res.status(409).json({ error: 'Las copias automáticas no están disponibles en este equipo.', code: av.reason }); return null; }
  const name = String(req.params.name);
  if (!autoBackupPath(av.dir, name)) { res.status(400).json({ error: 'Nombre de copia inválido' }); return null; }
  const text = await readAutoBackup(av.dir, name);
  if (text === null) { res.status(404).json({ error: 'Esa copia ya no existe' }); return null; }
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { res.status(400).json({ error: 'La copia está dañada.', code: 'datos' }); return null; }
  return openBackup(raw, { machineKey: av.key });
}

// ── POST /api/settings/backup/auto/:name/download ─────────────────────────
// Se descarga recifrada con la contraseña indicada: así sirve en otro equipo.
const downloadSchema = z.object({ password: z.string().max(1024) }).strict();
router.post('/backup/auto/:name/download', async (req: Request, res: Response) => {
  const v = downloadSchema.safeParse(req.body ?? {});
  if (!v.success) { sendZodError(res, v.error); return; }
  const invalid = validatePassword(v.data.password);
  if (invalid) { res.status(400).json({ error: invalid }); return; }
  await exclusive(res, async () => {
    try {
      const opened = await openAuto(req, res);
      if (!opened) return;
      res.json(await buildBackup(opened.data, { password: v.data.password }, new Date(opened.exported_at)));
    } catch (err) {
      sendBackupError(res, err, '/backup/auto/download');
    }
  });
});

// ── POST /api/settings/backup/auto/:name/restore ──────────────────────────
router.post('/backup/auto/:name/restore', async (req: Request, res: Response) => {
  if (!requireConfirm(res, req.body)) return;
  await exclusive(res, async () => {
    try {
      const opened = await openAuto(req, res);
      if (!opened) return;
      res.json(await restoreAndRecalc(opened));
    } catch (err) {
      sendBackupError(res, err, '/backup/auto/restore');
    }
  });
});

export default router;
