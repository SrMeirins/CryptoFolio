import type { OrigenPerdida } from '../pages/fiscal/types'

// Pérdidas pendientes por año de origen (#305): proporciones de la barra y
// aviso de las que caducan este año. Funciones puras.

const EPS = 0.01

export interface OrigenView extends OrigenPerdida {
  compensado: number
  /** Porcentajes de la barra: compensado, pendiente y caducado (suman 100). */
  pct: { compensado: number; pendiente: number; caducado: number }
  estado: 'caduca-este-anio' | 'vigente' | 'agotada' | 'caducada'
}

export function origenesView(origenes: readonly OrigenPerdida[], currentYear: number): OrigenView[] {
  return [...origenes].sort((a, b) => a.year - b.year).map(o => {
    const compensado = o.compensadoPatrim + o.compensadoRend
    const base = o.original > 0 ? o.original : 1
    const estado: OrigenView['estado'] = o.pendiente > EPS
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
