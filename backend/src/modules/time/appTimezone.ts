// Zona horaria de la aplicación (#388): la del día local, el mes y el
// ejercicio fiscal en toda la API. Se resuelve por orden: la clave «timezone»
// de app_config (Ajustes), la variable APP_TIMEZONE y, por defecto,
// Europe/Madrid. Esta es la única constante con la zona fija del backend.

export const DEFAULT_TIMEZONE = 'Europe/Madrid';
export const TIMEZONE_CONFIG_KEY = 'timezone';

export type TimezoneSource = 'ajuste' | 'variable' | 'defecto';
export interface TimezoneInfo {
  timezone: string
  source: TimezoneSource
  /** Ajuste guardado que no es una zona válida y se ha ignorado. */
  invalidSetting: string | null
}

/** Lo mínimo para consultar: el `db` de la app, un Pool o un cliente. */
type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

let supported: Set<string> | null = null;
/** ¿Es una zona IANA conocida por el motor de Intl? (lista blanca) */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false;
  supported ??= new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']);
  return supported.has(tz);
}

/**
 * Zona de la variable APP_TIMEZONE, o null si no está definida. Lanza si no
 * es válida: el backend no debe arrancar con una zona desconocida (fallo seguro).
 */
export function envTimezone(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.APP_TIMEZONE?.trim();
  if (!raw) return null;
  if (!isValidTimeZone(raw)) {
    throw new Error(`APP_TIMEZONE no es una zona horaria IANA válida: «${raw}» (por ejemplo Europe/Madrid o Atlantic/Canary)`);
  }
  return raw;
}

/** Resuelve la zona efectiva a partir del ajuste guardado y de la variable. */
export function resolveTimezone(setting: string | null | undefined, env: NodeJS.ProcessEnv = process.env): TimezoneInfo {
  const fromEnv = envTimezone(env);
  if (setting && isValidTimeZone(setting)) return { timezone: setting, source: 'ajuste', invalidSetting: null };
  const invalidSetting = setting ? setting : null;
  if (fromEnv) return { timezone: fromEnv, source: 'variable', invalidSetting };
  return { timezone: DEFAULT_TIMEZONE, source: 'defecto', invalidSetting };
}

let cached: TimezoneInfo | null = null;
let warned: string | null = null;

/** Zona efectiva con su origen. Se lee una vez y se reutiliza hasta que cambie el ajuste. */
export async function getTimezoneInfo(db: Queryable): Promise<TimezoneInfo> {
  if (cached) return cached;
  const res = await db.query('SELECT value FROM app_config WHERE key = $1', [TIMEZONE_CONFIG_KEY]);
  const info = resolveTimezone((res.rows[0]?.value as string | undefined) ?? null);
  if (info.invalidSetting && warned !== info.invalidSetting) {
    // Solo el nombre de la zona: no es un dato personal ni sensible.
    console.warn(`[CONFIG] Zona horaria guardada no válida («${info.invalidSetting}»); se usa ${info.timezone} (${info.source}).`);
    warned = info.invalidSetting;
  }
  cached = info;
  return info;
}

/** Zona efectiva (IANA) para las consultas y los cálculos de fechas. */
export async function getAppTimezone(db: Queryable): Promise<string> {
  return (await getTimezoneInfo(db)).timezone;
}

/** Olvida la zona en caché (al cambiar el ajuste). */
export function invalidateTimezoneCache(): void {
  cached = null;
}
