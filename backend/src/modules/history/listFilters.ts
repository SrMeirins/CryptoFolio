import { z } from 'zod';
import { currencySchema } from '../fiat/displayCurrency';
import { DB_OPERATION_TYPES, MARGIN_ACCOUNTS } from './operationGroups';
import { SUMMARY_CARDS, cardPredicate, marginSql } from './summaryCards';
import { operationLabelRankSql } from './operationLabels';

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

export const SORT_KEYS = ['fecha', 'valor', 'activo', 'tipo'] as const;
export type SortKey = typeof SORT_KEYS[number];

export const MAX_LIST_VALUES = 30;
const MAX_AMOUNT = 1e12;

/** Lista separada por comas (#366): sin vacíos ni repetidos, como mucho MAX_LIST_VALUES. */
const csvList = <T extends z.ZodType<unknown, string>>(item: T, what: string) =>
  z.string()
    .transform(v => [...new Set(v.split(',').map(x => x.trim()).filter(Boolean))])
    .pipe(z.array(item, { error: `${what} no válido` }).min(1, `indica al menos un ${what}`).max(MAX_LIST_VALUES, `como mucho ${MAX_LIST_VALUES} valores`));

/** Importe ≥ 0 con hasta 8 decimales y punto decimal. */
const amount = z.string().regex(/^\d{1,13}(\.\d{1,8})?$/, 'debe ser un importe positivo con punto decimal')
  .transform(Number).pipe(z.number().min(0).max(MAX_AMOUNT));

// Filtros y orden comunes al listado y a la exportación CSV (#349).
const filtersShape = {
  currency:       currencySchema,
  // Listas separadas por comas (#366): varios activos o tipos a la vez.
  asset:          csvList(z.string().regex(/^[A-Za-z0-9._-]{1,32}$/, 'activo no válido').transform(v => v.toUpperCase()), 'activo').optional(),
  type:           csvList(z.enum(DB_OPERATION_TYPES, { error: 'tipo de operación no válido' }), 'tipo de operación').optional(),
  // Rango del valor de la operación en la moneda pedida (currency).
  value_min:      amount.optional(),
  value_max:      amount.optional(),
  wallet_id:      z.uuid('debe ser un UUID válido').optional(),
  import_id:      z.uuid('debe ser un UUID válido').optional(),
  account:        z.string().trim().min(1).max(64, 'no puede superar 64 caracteres').optional(),
  date_from:      isoDay.optional(),
  date_to:        isoDay.optional(),
  search:         z.string().max(100, 'no puede superar 100 caracteres').optional(),
  manually_added: z.enum(['true', 'false'], { error: 'debe ser true o false' }).transform(v => v === 'true').optional(),
  // Importadas editadas (#378): «true» solo las editadas, «false» sin ellas.
  edited:         z.enum(['true', 'false'], { error: 'debe ser true o false' }).transform(v => v === 'true').optional(),
  // Comisiones agrupadas con su operación (#371): «false» las muestra como filas.
  group_fees:     z.enum(['true', 'false'], { error: 'debe ser true o false' }).transform(v => v === 'true').optional(),
  // Operaciones que suma una tarjeta del resumen (#407).
  tarjeta:        z.enum(SUMMARY_CARDS, { error: `debe ser una de: ${SUMMARY_CARDS.join(', ')}` }).optional(),
  // Margen del resumen (#403): en la lista solo cuenta con una tarjeta, como en ella.
  incluir_margen: z.enum(['true', 'false'], { error: 'incluir_margen debe ser true o false' }).transform(v => v === 'true').optional(),
  sort:           z.enum(SORT_KEYS, { error: `debe ser uno de: ${SORT_KEYS.join(', ')}` }).default('fecha'),
  dir:            z.enum(['asc', 'desc'], { error: 'debe ser asc o desc' }).default('desc'),
};
const datesInOrder = (f: { date_from?: string; date_to?: string }) => !f.date_from || !f.date_to || f.date_from <= f.date_to;
const datesMessage = { error: 'date_from no puede ser posterior a date_to', path: ['date_from'] };
const amountsInOrder = (f: { value_min?: number; value_max?: number }) =>
  f.value_min === undefined || f.value_max === undefined || f.value_min <= f.value_max;
const amountsMessage = { error: 'value_min no puede ser mayor que value_max', path: ['value_min'] };

export const historyQuerySchema = z.strictObject({
  ...filtersShape,
  limit:  intParam(1, MAX_PAGE_SIZE, 50),
  offset: intParam(0, MAX_OFFSET, 0),
}).refine(datesInOrder, datesMessage).refine(amountsInOrder, amountsMessage);
export type HistoryQuery = z.infer<typeof historyQuerySchema>;

/** Exportación CSV: los mismos filtros y orden, sin paginación. */
export const historyExportSchema = z.strictObject(filtersShape)
  .refine(datesInOrder, datesMessage).refine(amountsInOrder, amountsMessage);
export type HistoryFilters = z.infer<typeof historyExportSchema>;

/** ¿Hay algún filtro aplicado (no cuentan orden ni moneda)? */
export function hasFilters(f: HistoryFilters): boolean {
  return !!(f.asset?.length || f.type?.length || f.wallet_id || f.import_id || f.account || f.date_from || f.date_to
    || f.search || f.manually_added !== undefined || f.edited !== undefined || f.value_min !== undefined || f.value_max !== undefined
    || f.tarjeta);
}

/**
 * ORDER BY de lista blanca sobre `t` (que debe traer value_eur). Desempate
 * estable por fecha descendente e id, para paginar sin repetir ni saltar
 * filas; al ordenar por valor, las filas sin precio van siempre al final.
 */
export function buildHistoryOrderBy(sort: SortKey, dir: 'asc' | 'desc'): string {
  const d = dir === 'asc' ? 'ASC' : 'DESC';
  switch (sort) {
    case 'fecha':  return `ORDER BY t.timestamp ${d}, t.id ${d}`;
    case 'valor':  return `ORDER BY (t.value_eur IS NULL) ASC, t.value_eur ${d}, t.timestamp DESC, t.id DESC`;
    case 'activo': return `ORDER BY t.asset ${d}, t.timestamp DESC, t.id DESC`;
    case 'tipo':   return `ORDER BY ${operationLabelRankSql('t.operation_type')} ${d}, t.timestamp DESC, t.id DESC`;
  }
}

/** Escapa los comodines de LIKE/ILIKE para buscar el texto literal (con ESCAPE '\'). */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, ch => `\\${ch}`);
}

/**
 * WHERE parametrizado de los filtros sobre `t` (transactions). `tz` es la zona
 * del día local de date_from/date_to: el rango incluye días enteros en esa
 * zona, no en UTC. Devuelve los parámetros en orden ($1…$n).
 */
export function buildHistoryWhere(f: HistoryFilters, tz: string): { where: string; params: unknown[] } {
  const conds: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };

  if (f.import_id)      conds.push(`t.import_id = ${p(f.import_id)}`);
  if (f.asset?.length)  conds.push(`t.asset = ANY(${p(f.asset)}::text[])`);
  if (f.type?.length)   conds.push(`t.operation_type::text = ANY(${p(f.type)}::text[])`);
  // Wallet de origen o de destino (#395): una transferencia a la wallet también es suya.
  if (f.wallet_id) {
    const w = p(f.wallet_id);
    conds.push(`(t.wallet_id = ${w} OR t.destination_wallet_id = ${w})`);
  }
  if (f.account)        conds.push(`t.account = ${p(f.account)}`);
  if (f.date_from || f.date_to) {
    const zone = p(tz);
    if (f.date_from) conds.push(`t.timestamp >= (${p(f.date_from)}::date)::timestamp AT TIME ZONE ${zone}`);
    if (f.date_to)   conds.push(`t.timestamp < (${p(f.date_to)}::date + 1)::timestamp AT TIME ZONE ${zone}`);
  }
  if (f.search) {
    const s = p(`%${escapeLike(f.search)}%`);
    // Activo, nota, hash on-chain y nombre del archivo de origen (#366).
    conds.push(`(t.notes ILIKE ${s} ESCAPE '\\' OR t.asset ILIKE ${s} ESCAPE '\\' OR t.tx_hash ILIKE ${s} ESCAPE '\\'`
      + ` OR t.import_id IN (SELECT ci.id FROM csv_imports ci WHERE ci.filename ILIKE ${s} ESCAPE '\\'))`);
  }
  if (f.manually_added !== undefined) conds.push(`t.manually_added = ${p(f.manually_added)}`);
  if (f.edited !== undefined) conds.push(`t.original_import IS ${f.edited ? 'NOT ' : ''}NULL`);
  // Tarjeta del resumen (#407): lo mismo que suma, con su mismo criterio de margen.
  if (f.tarjeta) {
    conds.push(cardPredicate(f.tarjeta, 't'));
    if (!f.incluir_margen) conds.push(`NOT ${marginSql('t', `${p([...MARGIN_ACCOUNTS])}::text[]`)}`);
  }

  return { where: conds.length ? `WHERE ${conds.join(' AND ')}` : '', params };
}
