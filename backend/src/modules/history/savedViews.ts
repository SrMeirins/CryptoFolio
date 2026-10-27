import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { historyExportSchema } from './listFilters';

// Vistas guardadas del Historial (#369): combinaciones de filtros y orden con
// nombre, en app_config («historial_vistas») como una lista JSON. Los filtros
// se guardan con los nombres de la API (type, asset, value_min…) y se validan
// con el mismo esquema que GET /transactions, así que una vista nunca puede
// contener un filtro que la API rechazaría.

export const VIEWS_KEY = 'historial_vistas';
export const MAX_VIEWS = 20;
export const MAX_NAME = 40;
// Clave del bloqueo consultivo que serializa las escrituras (leer-modificar-escribir).
const LOCK_KEY = 'historial_vistas';

/** Nombre: 1–40 caracteres, sin caracteres de control. */
export const viewNameSchema = z.string().trim()
  .min(1, 'el nombre no puede estar vacío')
  .max(MAX_NAME, `el nombre no puede superar ${MAX_NAME} caracteres`)
  // eslint-disable-next-line no-control-regex
  .refine(v => !/[\u0000-\u001f\u007f]/.test(v), 'el nombre contiene caracteres no permitidos');

/**
 * Filtros de una vista: parámetros de la API del Historial como texto, sin
 * página ni moneda (el rango de importe se interpreta en la moneda de
 * visualización al aplicarla). Se validan con historyExportSchema.
 */
export const viewFiltersSchema = z.record(z.string(), z.string().max(1000, 'valor de filtro demasiado largo'))
  .superRefine((filtros, ctx) => {
    if ('currency' in filtros) {
      ctx.addIssue({ code: 'custom', message: 'una vista no guarda la moneda' });
      return;
    }
    const parsed = historyExportSchema.safeParse(filtros);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, path: [...issue.path] });
    }
  });

const storedViewSchema = z.object({
  id: z.uuid(),
  nombre: viewNameSchema,
  predeterminada: z.boolean(),
  filtros: viewFiltersSchema,
});
export type SavedView = z.infer<typeof storedViewSchema>;

const storedListSchema = z.array(storedViewSchema).max(MAX_VIEWS);

/**
 * Vistas guardadas. Si el JSON de app_config está dañado (editado a mano, una
 * versión antigua…) se trata como lista vacía y se registra, sin romper la API.
 */
export async function readViews(client: Pick<PoolClient, 'query'>): Promise<SavedView[]> {
  const res = await client.query('SELECT value FROM app_config WHERE key = $1', [VIEWS_KEY]);
  if (res.rows.length === 0) return [];
  try {
    const parsed = storedListSchema.safeParse(JSON.parse(res.rows[0].value));
    if (parsed.success) return parsed.data;
    console.warn('[VISTAS] El valor guardado de historial_vistas no es válido; se trata como vacío');
  } catch {
    console.warn('[VISTAS] El valor guardado de historial_vistas no es JSON; se trata como vacío');
  }
  return [];
}

async function writeViews(client: Pick<PoolClient, 'query'>, views: SavedView[]): Promise<void> {
  await client.query(
    `INSERT INTO app_config (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [VIEWS_KEY, JSON.stringify(views)],
  );
}

/** Error de la operación con su código HTTP (400, 404 o 409). */
export class ViewError extends Error {
  constructor(public readonly status: 400 | 404 | 409, message: string, public readonly conflictId?: string) {
    super(message);
    this.name = 'ViewError';
  }
}

const sameName = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' }) === 0;

/** Ejecuta `fn` sobre la lista dentro de una transacción con bloqueo, y guarda el resultado. */
async function mutate<T>(client: PoolClient, fn: (views: SavedView[]) => { views: SavedView[]; result: T }): Promise<T> {
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [LOCK_KEY]);
    const { views, result } = fn(await readViews(client));
    await writeViews(client, views);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  }
}

/** Solo una vista puede ser la predeterminada. */
function withDefault(views: SavedView[], id: string, value: boolean): SavedView[] {
  return views.map(v => (v.id === id ? { ...v, predeterminada: value } : value ? { ...v, predeterminada: false } : v));
}

export function createView(
  client: PoolClient,
  input: { nombre: string; predeterminada: boolean; filtros: Record<string, string>; sustituir: boolean },
): Promise<{ view: SavedView; replaced: boolean }> {
  return mutate<{ view: SavedView; replaced: boolean }>(client, views => {
    const existing = views.find(v => sameName(v.nombre, input.nombre));
    if (existing && !input.sustituir) throw new ViewError(409, `Ya existe una vista llamada «${existing.nombre}»`, existing.id);
    if (existing) {
      const updated = { ...existing, nombre: input.nombre, filtros: input.filtros };
      let next = views.map(v => (v.id === existing.id ? updated : v));
      next = withDefault(next, existing.id, input.predeterminada);
      return { views: next, result: { view: next.find(v => v.id === existing.id)!, replaced: true } };
    }
    if (views.length >= MAX_VIEWS) throw new ViewError(400, `Como mucho ${MAX_VIEWS} vistas guardadas`);
    const view: SavedView = { id: randomUUID(), nombre: input.nombre, predeterminada: false, filtros: input.filtros };
    const next = withDefault([...views, view], view.id, input.predeterminada);
    return { views: next, result: { view: next.find(v => v.id === view.id)!, replaced: false } };
  });
}

export function updateView(
  client: PoolClient, id: string,
  input: { nombre?: string; predeterminada?: boolean; filtros?: Record<string, string> },
): Promise<SavedView> {
  return mutate(client, views => {
    const current = views.find(v => v.id === id);
    if (!current) throw new ViewError(404, 'La vista no existe');
    if (input.nombre !== undefined) {
      const clash = views.find(v => v.id !== id && sameName(v.nombre, input.nombre!));
      if (clash) throw new ViewError(409, `Ya existe una vista llamada «${clash.nombre}»`, clash.id);
    }
    let next = views.map(v => (v.id === id ? { ...v, ...(input.nombre !== undefined ? { nombre: input.nombre } : {}), ...(input.filtros ? { filtros: input.filtros } : {}) } : v));
    if (input.predeterminada !== undefined) next = withDefault(next, id, input.predeterminada);
    return { views: next, result: next.find(v => v.id === id)! };
  });
}

export function deleteView(client: PoolClient, id: string): Promise<void> {
  return mutate(client, views => {
    if (!views.some(v => v.id === id)) throw new ViewError(404, 'La vista no existe');
    return { views: views.filter(v => v.id !== id), result: undefined };
  });
}
