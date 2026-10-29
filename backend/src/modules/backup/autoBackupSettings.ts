import { z } from 'zod';
import type { Queryable } from './backupTables';

// Ajustes de las copias automáticas (#454), en app_config con valores cerrados.
// Sin guardar: activadas, diarias y 7 copias.

export const AUTO_BACKUP_ENABLED_KEY = 'auto_backup_enabled';
export const AUTO_BACKUP_FREQUENCY_KEY = 'auto_backup_frequency';
export const AUTO_BACKUP_KEEP_KEY = 'auto_backup_keep';

/** Frecuencias permitidas, en horas. */
export const AUTO_BACKUP_FREQUENCIES = ['12', '24', '168'] as const;
export const KEEP_MIN = 3;
export const KEEP_MAX = 30;

export const autoBackupSchemas: Record<string, z.ZodType<string>> = {
  [AUTO_BACKUP_ENABLED_KEY]: z.enum(['true', 'false'], { error: 'auto_backup_enabled debe ser true o false' }),
  [AUTO_BACKUP_FREQUENCY_KEY]: z.enum(AUTO_BACKUP_FREQUENCIES, { error: 'auto_backup_frequency debe ser 12, 24 o 168 (horas)' }),
  [AUTO_BACKUP_KEEP_KEY]: z.string().regex(/^\d{1,2}$/, 'auto_backup_keep debe ser un número')
    .refine(v => Number(v) >= KEEP_MIN && Number(v) <= KEEP_MAX, `auto_backup_keep debe estar entre ${KEEP_MIN} y ${KEEP_MAX}`),
};

export interface AutoBackupSettings { enabled: boolean; frequencyHours: number; keep: number }
export const AUTO_BACKUP_DEFAULTS: AutoBackupSettings = { enabled: true, frequencyHours: 24, keep: 7 };

/** Lee los ajustes; un valor que no pase su validación cuenta como el de por defecto. */
export function parseAutoBackupSettings(config: Record<string, string | undefined>): AutoBackupSettings {
  const valid = (key: string) => {
    const v = config[key];
    return v !== undefined && autoBackupSchemas[key].safeParse(v).success ? v : undefined;
  };
  const enabled = valid(AUTO_BACKUP_ENABLED_KEY);
  const frequency = valid(AUTO_BACKUP_FREQUENCY_KEY);
  const keep = valid(AUTO_BACKUP_KEEP_KEY);
  return {
    enabled: enabled === undefined ? AUTO_BACKUP_DEFAULTS.enabled : enabled === 'true',
    frequencyHours: frequency ? Number(frequency) : AUTO_BACKUP_DEFAULTS.frequencyHours,
    keep: keep ? Number(keep) : AUTO_BACKUP_DEFAULTS.keep,
  };
}

export async function readAutoBackupSettings(client: Queryable): Promise<AutoBackupSettings> {
  const { rows } = await client.query<{ key: string; value: string }>(
    'SELECT key, value FROM app_config WHERE key = ANY($1)',
    [[AUTO_BACKUP_ENABLED_KEY, AUTO_BACKUP_FREQUENCY_KEY, AUTO_BACKUP_KEEP_KEY]],
  );
  return parseAutoBackupSettings(Object.fromEntries(rows.map(r => [r.key, r.value])));
}
