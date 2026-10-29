import { db } from '../../db/client';
import { machineKey } from './backupCrypto';
import { buildBackup } from './backupEnvelope';
import { readBackupData } from './backupTables';
import { readAutoBackupSettings } from './autoBackupSettings';
import { autoBackupName, listAutoBackups, rotateAutoBackups, writeAutoBackup } from './autoBackupStore';

// Copias automáticas (#454). El backend las hace en AUTO_BACKUP_DIR (la fija
// docker-compose o la app de escritorio), cifradas con la clave del equipo.
// Sin carpeta o sin clave no se hacen: nunca se escribe una copia en claro.
// Se comprueba al arrancar y cada hora si toca según la frecuencia elegida;
// la referencia es la copia más reciente de la carpeta, que sobrevive a una
// restauración. Una copia fallida no rota: las anteriores se conservan.

export type Unavailable = 'sin-carpeta' | 'sin-clave';

export type Availability =
  | { available: true; dir: string; key: Buffer }
  | { available: false; reason: Unavailable };

export function autoBackupAvailability(env: NodeJS.ProcessEnv = process.env): Availability {
  const dir = env.AUTO_BACKUP_DIR?.trim();
  if (!dir) return { available: false, reason: 'sin-carpeta' };
  const key = machineKey(env.WALLET_SYNC_ENCRYPTION_KEY);
  if (!key) return { available: false, reason: 'sin-clave' };
  return { available: true, dir, key };
}

export interface AutoBackupFailure { at: string; message: string }

// Último fallo, en memoria: tras reiniciar se vuelve a intentar al momento.
let lastFailure: AutoBackupFailure | null = null;
let running: Promise<{ name: string; rotated: string[] }> | null = null;

export function lastAutoBackupFailure(): AutoBackupFailure | null {
  return lastFailure;
}

/** Solo para tests. */
export function resetAutoBackupState(): void {
  lastFailure = null;
  running = null;
}

/** ¿Toca otra copia? Sin ninguna previa, sí. */
export function isDue(newest: Date | null, now: Date, frequencyHours: number): boolean {
  return !newest || now.getTime() - newest.getTime() >= frequencyHours * 3_600_000;
}

// Motivo legible sin detalles internos (rutas, pila).
function failureMessage(err: unknown): string {
  const code = (err as NodeJS.ErrnoException).code;
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') return 'Sin permiso para escribir en la carpeta de copias.';
  if (code === 'ENOSPC') return 'No queda espacio en el disco.';
  return 'No se pudo escribir la copia.';
}

function recordFailure(err: unknown, now: Date): void {
  lastFailure = { at: now.toISOString(), message: failureMessage(err) };
  console.error('[autoBackup] copia fallida:', (err as NodeJS.ErrnoException).code ?? (err as Error).name);
}

/** Hace una copia ahora y rota las antiguas. Si ya hay una en curso, espera a esa. */
export function runAutoBackup(now = new Date()): Promise<{ name: string; rotated: string[] }> {
  if (running) return running;
  running = (async () => {
    const av = autoBackupAvailability();
    if (!av.available) throw new Error(av.reason);
    try {
      const { keep } = await readAutoBackupSettings(db);
      const file = await buildBackup(await readBackupData(db), { machineKey: av.key }, now);
      const name = autoBackupName(now);
      await writeAutoBackup(av.dir, name, JSON.stringify(file));
      const rotated = await rotateAutoBackups(av.dir, keep);
      lastFailure = null;
      return { name, rotated };
    } catch (err) {
      recordFailure(err, now);
      throw err;
    }
  })().finally(() => { running = null; });
  return running;
}

/** Hace la copia si están activadas, disponibles y toca. */
export async function runAutoBackupIfDue(now = new Date()): Promise<boolean> {
  const av = autoBackupAvailability();
  if (!av.available) return false;
  const settings = await readAutoBackupSettings(db);
  if (!settings.enabled) return false;
  let newest;
  try {
    [newest] = await listAutoBackups(av.dir);
  } catch (err) {
    recordFailure(err, now);
    throw err;
  }
  if (!isDue(newest ? new Date(newest.created_at) : null, now, settings.frequencyHours)) return false;
  await runAutoBackup(now);
  return true;
}

const CHECK_EVERY_MS = 60 * 60 * 1000;

export function scheduleAutoBackups(): void {
  const check = () => {
    runAutoBackupIfDue().catch(() => { /* ya registrado en lastFailure y en el log */ });
  };
  // Con margen para no competir con el resto del arranque.
  setTimeout(check, 45_000).unref();
  setInterval(check, CHECK_EVERY_MS).unref();
}
