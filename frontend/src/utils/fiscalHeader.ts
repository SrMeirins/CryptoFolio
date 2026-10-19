import { calcularTramos, type Tramo } from './tramosIrpf'

// Cabecera y navegación de Fiscal (#297): cuota del ahorro, comparación con
// el año anterior, pestaña de la URL, año contiguo y atajos. Funciones puras.

export type FiscalVista = 'resumen' | 'operaciones' | 'modelo721'
export const FISCAL_VISTAS: readonly FiscalVista[] = ['resumen', 'operaciones', 'modelo721']

/** Pestaña a partir del parámetro `vista`; cualquier otro valor cae en Resumen. */
export function parseVista(raw: string | null): FiscalVista {
  return (FISCAL_VISTAS as readonly string[]).includes(raw ?? '') ? (raw as FiscalVista) : 'resumen'
}

/** Año a la izquierda (−1) o a la derecha (+1) en el selector; null en los extremos. */
export function adjacentYear(years: readonly number[], active: number, step: -1 | 1): number | null {
  const i = years.indexOf(active)
  if (i < 0) return null
  return years[i + step] ?? null
}

/** Cuota del ahorro y tipo medio para una base ya compensada; 0 si la base no es positiva. */
export function cuotaAhorro(base: number, tramos?: Tramo[]): { cuota: number; tipoMedio: number } {
  const desglose = calcularTramos(base, tramos)
  const cuota = desglose.reduce((s, t) => s + t.cuota, 0)
  return { cuota, tipoMedio: base > 0 ? (cuota / base) * 100 : 0 }
}

const MADRID_MD = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', month: '2-digit', day: '2-digit' })

/** Día de hoy en Madrid como MM-DD, para comparar con el mismo periodo del año anterior. */
export function madridMonthDay(now: Date = new Date()): string {
  const parts = MADRID_MD.formatToParts(now)
  return `${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`
}

export interface YearComparison {
  /** «2025 a estas alturas» en el año en curso; «2025» si el año está cerrado. */
  label: string
  netoDelta: number
  /** Solo en años cerrados: la cuota del año en curso aún no es comparable. */
  cuotaDelta: number | null
}

/** Comparación con el año anterior; null si no hay datos del anterior. */
export function yearComparison(args: {
  year: number
  esAnioEnCurso: boolean
  neto: number
  cuota: number
  prevNeto: number | null
  prevCuota: number | null
}): YearComparison | null {
  if (args.prevNeto === null) return null
  const prev = args.year - 1
  return {
    label: args.esAnioEnCurso ? `${prev} a estas alturas` : String(prev),
    netoDelta: args.neto - args.prevNeto,
    cuotaDelta: !args.esAnioEnCurso && args.prevCuota !== null ? args.cuota - args.prevCuota : null,
  }
}

/** Los atajos no actúan mientras se escribe ni con modificadores. */
export function isTypingTarget(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable === true
}
