import { z } from 'zod';
import { currencySchema } from '../fiat/displayCurrency';
import { DB_OPERATION_TYPES } from './operationGroups';

// Filtros de GET /transactions validados con zod (#346). Antes llegaban sin
// validar: limit sin máximo, un id que no era UUID daba 500 y `%`/`_` actuaban
// como comodines del ILIKE.

export const MAX_PAGE_SIZE = 200;
const MAX_OFFSET = 1_000_000;

/** Fecha de calendario AAAA-MM-DD válida (rechaza 2026-02-30). */
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'debe tener formato AAAA-MM-DD').refine(v => {
  const d = new Date(`${v}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, 'no es una fecha válida');

const intParam = (min: number, max: number, def: number) =>
  z.string().regex(/^\d+$/, 'debe ser un entero').default(String(def))
    .transform(Number)
    .pipe(z.number().int().min(min, `debe ser como mínimo ${min}`).max(max, `debe ser como máximo ${max}`));

export const historyQuerySchema = z.object({
  currency:       currencySchema,
  asset:          z.string().trim().regex(/^[A-Za-z0-9._-]{1,32}$/, 'activo no válido').transform(v => v.toUpperCase()).optional(),
  type:           z.enum(DB_OPERATION_TYPES, { message: 'tipo de operación no válido' }).optional(),
  wallet_id:      z.string().uuid('debe ser un UUID válido').optional(),
  import_id:      z.string().uuid('debe ser un UUID válido').optional(),
  account:        z.string().trim().min(1).max(64, 'no puede superar 64 caracteres').optional(),
  date_from:      isoDay.optional(),
  date_to:        isoDay.optional(),
  search:         z.string().max(100, 'no puede superar 100 caracteres').optional(),
  manually_added: z.enum(['true', 'false'], { message: 'debe ser true o false' }).transform(v => v === 'true').optional(),
  limit:          intParam(1, MAX_PAGE_SIZE, 50),
  offset:         intParam(0, MAX_OFFSET, 0),
}).strict().refine(f => !f.date_from || !f.date_to || f.date_from <= f.date_to, {
  message: 'date_from no puede ser posterior a date_to', path: ['date_from'],
});
export type HistoryQuery = z.infer<typeof historyQuerySchema>;

/** Escapa los comodines de LIKE/ILIKE para buscar el texto literal (con ESCAPE '\'). */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, ch => `\\${ch}`);
}

/**
 * WHERE parametrizado de los filtros sobre `t` (transactions). `tz` es la zona
 * del día local de date_from/date_to: el rango incluye días enteros en esa
 * zona, no en UTC. Devuelve los parámetros en orden ($1…$n).
 */
export function buildHistoryWhere(f: HistoryQuery, tz: string): { where: string; params: unknown[] } {
  const conds: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };

  if (f.import_id)      conds.push(`t.import_id = ${p(f.import_id)}`);
  if (f.asset)          conds.push(`t.asset = ${p(f.asset)}`);
  if (f.type)           conds.push(`t.operation_type = ${p(f.type)}`);
  if (f.wallet_id)      conds.push(`t.wallet_id = ${p(f.wallet_id)}`);
  if (f.account)        conds.push(`t.account = ${p(f.account)}`);
  if (f.date_from || f.date_to) {
    const zone = p(tz);
    if (f.date_from) conds.push(`t.timestamp >= (${p(f.date_from)}::date)::timestamp AT TIME ZONE ${zone}`);
    if (f.date_to)   conds.push(`t.timestamp < (${p(f.date_to)}::date + 1)::timestamp AT TIME ZONE ${zone}`);
  }
  if (f.search) {
    const s = p(`%${escapeLike(f.search)}%`);
    conds.push(`(t.notes ILIKE ${s} ESCAPE '\\' OR t.asset ILIKE ${s} ESCAPE '\\')`);
  }
  if (f.manually_added !== undefined) conds.push(`t.manually_added = ${p(f.manually_added)}`);

  return { where: conds.length ? `WHERE ${conds.join(' AND ')}` : '', params };
}
