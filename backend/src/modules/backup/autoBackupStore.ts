import { promises as fs } from 'fs';
import path from 'path';

// Ficheros de las copias automáticas (#454): nombre con la fecha en UTC,
// carpeta 700 y ficheros 600, escritura atómica (temporal y renombrado) y
// rotación que conserva las N más recientes. Solo se tocan los ficheros con
// este nombre; nada fuera de la carpeta.

const FILE_RE = /^cryptofolio-auto-(\d{8})-(\d{6})\.json$/;

export interface AutoBackupFile { name: string; size: number; created_at: string }

export function autoBackupName(now: Date): string {
  const iso = now.toISOString(); // 2026-01-02T03:04:05.678Z
  return `cryptofolio-auto-${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 19).replace(/:/g, '')}.json`;
}

/** Fecha de una copia según su nombre, o null si el nombre no es de una copia automática. */
export function dateFromName(name: string): Date | null {
  const m = FILE_RE.exec(name);
  if (!m) return null;
  const [d, t] = [m[1], m[2]];
  const date = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** De una lista de nombres, los que sobran para quedarse con las `keep` más recientes. */
export function namesToRotate(names: readonly string[], keep: number): string[] {
  return names.filter(n => dateFromName(n)).sort().reverse().slice(keep);
}

export async function listAutoBackups(dir: string): Promise<AutoBackupFile[]> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const files: AutoBackupFile[] = [];
  for (const name of names.filter(n => dateFromName(n)).sort().reverse()) {
    const stat = await fs.stat(path.join(dir, name));
    if (stat.isFile()) files.push({ name, size: stat.size, created_at: (dateFromName(name) as Date).toISOString() });
  }
  return files;
}

/** Ruta de una copia por su nombre; null si el nombre no es válido (evita salir de la carpeta). */
export function autoBackupPath(dir: string, name: string): string | null {
  if (path.basename(name) !== name || !dateFromName(name)) return null;
  return path.join(dir, name);
}

export async function writeAutoBackup(dir: string, name: string, content: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const final = autoBackupPath(dir, name);
  if (!final) throw new Error('Nombre de copia inválido');
  const tmp = `${final}.tmp`;
  try {
    await fs.writeFile(tmp, content, { mode: 0o600, flag: 'wx' });
    await fs.rename(tmp, final);
  } catch (err) {
    await fs.unlink(tmp).catch(() => undefined);
    throw err;
  }
}

/** Borra las que sobran tras una copia correcta. Devuelve las borradas. */
export async function rotateAutoBackups(dir: string, keep: number): Promise<string[]> {
  const sobran = namesToRotate((await listAutoBackups(dir)).map(f => f.name), keep);
  for (const name of sobran) await fs.unlink(path.join(dir, name));
  return sobran;
}

export async function readAutoBackup(dir: string, name: string): Promise<string | null> {
  const file = autoBackupPath(dir, name);
  if (!file) return null;
  try {
    return await fs.readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}
