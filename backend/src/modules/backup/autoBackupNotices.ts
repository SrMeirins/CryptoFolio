import { db } from '../../db/client';
import type { SystemNotification } from '../notifications/collect';
import { autoBackupAvailability, lastAutoBackupFailure, type Unavailable } from './autoBackup';
import { readAutoBackupSettings } from './autoBackupSettings';

// Avisos de las copias automáticas (#454), en la categoría «Copias».

const UNAVAILABLE: Record<Unavailable, string> = {
  'sin-carpeta': 'Las copias automáticas no están disponibles: falta la carpeta de copias (AUTO_BACKUP_DIR).',
  'sin-clave': 'Las copias automáticas no se hacen: falta la clave del equipo (WALLET_SYNC_ENCRYPTION_KEY). Sin ella no se cifran, y en claro no se guardan.',
};

export function noticesFor(enabled: boolean, availability: ReturnType<typeof autoBackupAvailability>,
  failure: ReturnType<typeof lastAutoBackupFailure>): SystemNotification[] {
  if (!enabled) return [];
  if (!availability.available) {
    return [{ id: 'backup-unavailable', type: 'warning', category: 'Copias', message: UNAVAILABLE[availability.reason] }];
  }
  if (failure) {
    return [{ id: 'backup-failed', type: 'error', category: 'Copias', message: `Falló la última copia automática: ${failure.message} Las anteriores se conservan.` }];
  }
  return [];
}

export async function avisosCopias(): Promise<SystemNotification[]> {
  const { enabled } = await readAutoBackupSettings(db);
  return noticesFor(enabled, autoBackupAvailability(), lastAutoBackupFailure());
}
