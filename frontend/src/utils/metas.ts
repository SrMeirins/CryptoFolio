import type { Currency } from './format'
import { precioEnMoneda } from './alertas'
import { T } from './colors'

// Metas de inversión (#520): lectura de la clave de app_config, cambios en la
// lista y progreso por tipo. Funciones puras.

export const METAS_KEY = 'metas'
export const MAX_METAS = 6
export const MAX_NOMBRE_META = 40

export type TipoMeta = 'valor' | 'aportado' | 'cantidad'

export type Meta =
  | { id: string; nombre: string; tipo: 'valor' | 'aportado'; objetivo: number; moneda: 'EUR' | 'USD' }
  | { id: string; nombre: string; tipo: 'cantidad'; objetivo: number; activo: string }

export const TIPO_META_TEXTO: Record<TipoMeta, string> = {
  valor: 'Valor total de la cartera',
  aportado: 'Aportado este año',
  cantidad: 'Cantidad de un activo',
}

/** Color de cada tipo (variable del tema): el de la KPI con la que se mide. */
export const COLOR_META: Record<TipoMeta, string> = { valor: T.brand, aportado: T.purple, cantidad: T.info }

const esMoneda = (v: unknown): v is 'EUR' | 'USD' => v === 'EUR' || v === 'USD'

/** Una meta bien formada o null; la validación completa la hace el backend. */
function aMeta(v: unknown): Meta | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.nombre !== 'string' || typeof o.objetivo !== 'number' || !(o.objetivo > 0)) return null
  if ((o.tipo === 'valor' || o.tipo === 'aportado') && esMoneda(o.moneda)) return { id: o.id, nombre: o.nombre, tipo: o.tipo, objetivo: o.objetivo, moneda: o.moneda }
  if (o.tipo === 'cantidad' && typeof o.activo === 'string') return { id: o.id, nombre: o.nombre, tipo: 'cantidad', objetivo: o.objetivo, activo: o.activo }
  return null
}

/** Metas guardadas en la configuración; sin clave o con JSON roto, ninguna. */
export function leerMetas(config: Readonly<Record<string, string>> | undefined): Meta[] {
  const raw = config?.[METAS_KEY]
  if (!raw) return []
  try {
    const lista = JSON.parse(raw) as unknown
    return Array.isArray(lista) ? lista.map(aMeta).filter((m): m is Meta => m !== null).slice(0, MAX_METAS) : []
  } catch {
    return []
  }
}

/** Añade la meta o sustituye la del mismo id, conservando el orden. */
export function guardarEnLista(lista: readonly Meta[], meta: Meta): Meta[] {
  return lista.some(m => m.id === meta.id) ? lista.map(m => (m.id === meta.id ? meta : m)) : [...lista, meta]
}

export function quitarDeLista(lista: readonly Meta[], id: string): Meta[] {
  return lista.filter(m => m.id !== id)
}

/** Datos en vivo con los que se mide el progreso, en la moneda de visualización. */
export interface ContextoMetas {
  currency: Currency
  /** Unidades de la moneda de visualización por EUR (como useDisplayMarket). */
  rate: number | null
  /** Valor total en vivo (cripto y efectivo); null sin precios. */
  valorTotal: number | null
  /** Euros depositados menos retirados en el año en curso; null mientras carga. */
  aportadoAnio: number | null
  /** Cantidad total por activo (todas las wallets). */
  cantidades: Readonly<Record<string, number>>
  /** Valor en vivo por activo en la moneda de visualización (sin precio, ausente). */
  valores?: Readonly<Record<string, number>>
}

export interface ProgresoMeta {
  actual: number
  /** Objetivo en la unidad en que se muestra (moneda de visualización o el activo). */
  objetivo: number
  /** Porcentaje real; puede pasar de 100 o ser negativo (aportado neto negativo). */
  pct: number
  /** Ancho de la barra, de 0 a 100. */
  relleno: number
  /** Lo que falta para llegar; 0 si ya se ha llegado. */
  faltan: number
  cumplida: boolean
  /** Moneda de las cifras, o null si son unidades de un activo. */
  moneda: Currency | null
  /** En las de cantidad, lo que vale ahora lo acumulado (moneda de visualización); null si no hay precio. */
  valorActual: number | null
}

/**
 * Progreso de una meta con los datos en vivo, o null si no se puede medir
 * (sin precios, sin el tipo de cambio para convertir el objetivo o mientras
 * carga lo aportado).
 */
export function progresoMeta(meta: Meta, ctx: ContextoMetas): ProgresoMeta | null {
  let actual: number | null
  let objetivo: number | null
  let moneda: Currency | null = null
  if (meta.tipo === 'cantidad') {
    actual = ctx.cantidades[meta.activo] ?? 0
    objetivo = meta.objetivo
  } else {
    actual = meta.tipo === 'valor' ? ctx.valorTotal : ctx.aportadoAnio
    objetivo = precioEnMoneda(meta.objetivo, meta.moneda, ctx.currency, ctx.rate)
    moneda = ctx.currency
  }
  if (actual === null || objetivo === null || !(objetivo > 0) || !Number.isFinite(actual)) return null
  const pct = (actual / objetivo) * 100
  return {
    actual,
    objetivo,
    pct,
    relleno: Math.min(100, Math.max(0, pct)),
    faltan: Math.max(0, objetivo - actual),
    cumplida: actual >= objetivo,
    moneda,
    valorActual: meta.tipo === 'cantidad' ? ctx.valores?.[meta.activo] ?? null : null,
  }
}

/** «73 %» o «más de 999 %», sin decimales por encima de 10 % y con uno por debajo. */
export function textoPct(pct: number): string {
  if (pct > 999) return 'más de 999 %'
  const abs = Math.abs(pct)
  const n = abs >= 10 || abs === 0 ? Math.round(pct).toString() : pct.toFixed(1).replace('.', ',')
  return `${n} %`
}

/** Versión corta para el centro del anillo: «75 %», «3,3 %» o «999+ %». */
export function textoPctCorto(pct: number): string {
  return pct > 999 ? '999+ %' : textoPct(pct)
}

/** Id nuevo para una meta: aleatorio, para no depender del orden. */
export function nuevoIdMeta(): string {
  return crypto.randomUUID()
}
