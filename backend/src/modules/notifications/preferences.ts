import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { SystemNotification } from './collect';

// Preferencias de los avisos (#447): categorías silenciadas y avisos
// descartados. Un aviso descartado se oculta hasta que cambie su contenido:
// se guarda su huella (id, mensaje y recuento) y, si cambia, vuelve a salir.

export const MUTED_KEY = 'notifications_muted';
export const DISMISSED_KEY = 'notifications_dismissed';

/** Categorías que se pueden silenciar, con la etiqueta que llevan los avisos. */
export const NOTIFICATION_CATEGORIES = {
  precios: 'Precios',
  portfolio: 'Portfolio',
  retiros: 'Retiros',
  depositos: 'Depósitos',
  wallets: 'Wallets',
  importar: 'Importar',
  fiscal: 'Fiscal',
  copias: 'Copias',
} as const;
export type CategoryKey = keyof typeof NOTIFICATION_CATEGORIES;
const CATEGORY_KEYS = Object.keys(NOTIFICATION_CATEGORIES) as CategoryKey[];

/** Clave de la categoría de un aviso; null si no es una de las silenciables. */
export function categoryKey(category: string): CategoryKey | null {
  return CATEGORY_KEYS.find(k => NOTIFICATION_CATEGORIES[k] === category) ?? null;
}

/** Valor de notifications_muted: lista JSON de categorías conocidas, sin repetir. */
export const mutedSchema = z.string().refine(raw => {
  try {
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) && arr.length <= CATEGORY_KEYS.length
      && new Set(arr).size === arr.length && arr.every(k => CATEGORY_KEYS.includes(k as CategoryKey));
  } catch { return false; }
}, `notifications_muted debe ser una lista JSON con categorías de: ${CATEGORY_KEYS.join(', ')}`);

/** Huella del contenido de un aviso: si cambia, el descarte deja de aplicar. */
export function fingerprint(n: Pick<SystemNotification, 'id' | 'message' | 'count'>): string {
  return createHash('sha256').update(`${n.id}|${n.message}|${n.count ?? ''}`).digest('hex').slice(0, 16);
}

export interface NotificationPrefs { muted: ReadonlySet<CategoryKey>; dismissed: Readonly<Record<string, string>> }

/** Preferencias desde app_config; un valor dañado cuenta como vacío. */
export function parsePrefs(mutedRaw: string | undefined, dismissedRaw: string | undefined): NotificationPrefs {
  let muted: CategoryKey[] = [];
  if (mutedRaw && mutedSchema.safeParse(mutedRaw).success) muted = JSON.parse(mutedRaw) as CategoryKey[];
  let dismissed: Record<string, string> = {};
  try {
    const obj = dismissedRaw ? JSON.parse(dismissedRaw) as unknown : {};
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      dismissed = Object.fromEntries(Object.entries(obj).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
    }
  } catch { dismissed = {}; }
  return { muted: new Set(muted), dismissed };
}

export function notificationState(n: SystemNotification, prefs: NotificationPrefs): { muted: boolean; dismissed: boolean; categoryKey: CategoryKey | null } {
  const key = categoryKey(n.category);
  return {
    categoryKey: key,
    muted: key !== null && prefs.muted.has(key),
    dismissed: prefs.dismissed[n.id] === fingerprint(n),
  };
}

/** Avisos que se muestran: ni de una categoría silenciada ni descartados con su contenido actual. */
export function visibleNotifications(all: readonly SystemNotification[], prefs: NotificationPrefs): SystemNotification[] {
  return all.filter(n => { const s = notificationState(n, prefs); return !s.muted && !s.dismissed; });
}

/** Descartes con los nuevos añadidos; solo se guardan los avisos que siguen existiendo para no crecer sin límite. */
export function dismissWith(previous: Readonly<Record<string, string>>, targets: readonly SystemNotification[], current: readonly SystemNotification[] = targets): Record<string, string> {
  const alive = new Set(current.map(n => n.id));
  const next: Record<string, string> = {};
  for (const [id, fp] of Object.entries(previous)) if (alive.has(id)) next[id] = fp;
  for (const n of targets) next[n.id] = fingerprint(n);
  return next;
}

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ key: string; value: string }> }> };

export async function readNotificationPrefs(db: Queryable): Promise<NotificationPrefs> {
  const { rows } = await db.query('SELECT key, value FROM app_config WHERE key = ANY($1)', [[MUTED_KEY, DISMISSED_KEY]]);
  const get = (k: string) => rows.find(r => r.key === k)?.value;
  return parsePrefs(get(MUTED_KEY), get(DISMISSED_KEY));
}

export async function saveDismissed(db: Queryable, dismissed: Record<string, string>): Promise<void> {
  await db.query(
    `INSERT INTO app_config (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [DISMISSED_KEY, JSON.stringify(dismissed)],
  );
}
