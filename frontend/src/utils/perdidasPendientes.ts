import type { OrigenPerdida } from '../pages/fiscal/types'

// Pérdidas pendientes por año de origen (#305): proporciones de la barra y
// aviso de las que caducan este año. Funciones puras.

const EPS = 0.01

export interface OrigenView extends OrigenPerdida {
  compensado: number
  /** Porcentajes de la barra: compensado, pendiente y caducado (suman 100). */
  pct: { compensado: number; pendiente: number; caducado: number }
  estado: 'provisional' | 'caduca-este-anio' | 'vigente' | 'agotada' | 'caducada'
}

export function origenesView(origenes: readonly OrigenPerdida[], currentYear: number): OrigenView[] {
  return [...origenes].sort((a, b) => a.year - b.year).map(o => {
    const compensado = o.compensadoPatrim + o.compensadoRend
    const base = o.original > 0 ? o.original : 1
    // La del año en curso aún puede compensarse con ganancias del mismo año (#534).
    const estado: OrigenView['estado'] = o.provisional && o.pendiente > EPS
      ? 'provisional'
      : o.pendiente > EPS
        ? (o.caducaEn <= currentYear ? 'caduca-este-anio' : 'vigente')
        : o.caducado > EPS ? 'caducada' : 'agotada'
    return {
      ...o, compensado, estado,
      pct: { compensado: (compensado / base) * 100, pendiente: (o.pendiente / base) * 100, caducado: (o.caducado / base) * 100 },
    }
  })
}

/** Pérdidas que caducan el 31 de diciembre del año en curso; null si no hay. */
export function caducanEsteAnio(origenes: readonly OrigenPerdida[], currentYear: number): { importe: number; years: number[] } | null {
  const list = origenes.filter(o => o.pendiente > EPS && o.caducaEn === currentYear)
  if (list.length === 0) return null
  return { importe: list.reduce((s, o) => s + o.pendiente, 0), years: list.map(o => o.year) }
}

export function totalCaducado(origenes: readonly OrigenPerdida[]): number {
  return origenes.reduce((s, o) => s + o.caducado, 0)
}

// ── #541: escala común, cuenta atrás y detalle año a año ────────────────────

/** Ancho de la barra de cada año en % de la mayor pérdida: todas en la misma escala. */
export function anchoEscalaComun(origenes: readonly Pick<OrigenPerdida, 'original'>[]): (original: number) => number {
  const max = Math.max(0, ...origenes.map(o => o.original))
  return original => (max > 0 ? Math.min(100, (original / max) * 100) : 0)
}

const DAY_MS = 86_400_000
const dias = (desde: string, hasta: string) => Math.round((Date.UTC(...ymd(hasta)) - Date.UTC(...ymd(desde))) / DAY_MS)
function ymd(d: string): [number, number, number] {
  const [y, m, dd] = d.split('-').map(Number)
  return [y, m - 1, dd]
}
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/**
 * Cuenta atrás hasta el 31 de diciembre del año en que caduca (#541): en días
 * si queda menos de un trimestre, en meses si menos de un año y en años y
 * meses si más. `pronto` a 90 días o menos.
 */
export function cuentaAtras(caducaEn: number, hoy: string): { dias: number; texto: string; corto: string; pronto: boolean } {
  const fin = `${caducaEn}-12-31`
  const d = dias(hoy, fin)
  if (d < 0) return { dias: d, texto: 'Caducada', corto: 'Caducada', pronto: false }
  if (d === 0) return { dias: 0, texto: 'Caduca hoy', corto: 'Hoy', pronto: true }
  if (d <= 90) return { dias: d, texto: `Caduca en ${plural(d, 'día', 'días')}`, corto: plural(d, 'día', 'días'), pronto: true }
  // Meses hasta diciembre del año de caducidad, sin contar el mes en curso.
  const [y, m] = ymd(hoy)
  const meses = (caducaEn - y) * 12 + (11 - m)
  if (meses < 12) { const c = plural(Math.max(1, meses), 'mes', 'meses'); return { dias: d, texto: `Caduca en ${c}`, corto: c, pronto: false } }
  const anios = Math.floor(meses / 12), resto = meses % 12
  const corto = `${plural(anios, 'año', 'años')}${resto > 0 ? ` y ${plural(resto, 'mes', 'meses')}` : ''}`
  return { dias: d, texto: `Caduca en ${corto}`, corto, pronto: false }
}

export interface FilaDetalle {
  year: number
  patrim: number
  rend: number
  /** Lo que quedaba pendiente tras ese ejercicio. */
  queda: number
}

/** Detalle de compensación año a año de una pérdida, con lo que quedaba después de cada ejercicio. */
export function detalleCompensacion(o: Pick<OrigenPerdida, 'original' | 'aplicaciones'>): FilaDetalle[] {
  let queda = o.original
  return [...(o.aplicaciones ?? [])].sort((a, b) => a.year - b.year).map(a => {
    queda -= a.patrim + a.rend
    return { ...a, queda: Math.max(0, queda) }
  })
}
