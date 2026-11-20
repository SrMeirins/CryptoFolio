import { totalTramo, type DiaValorado, type TotalTramo } from './calendarioDietz'

// Panel Rendimiento del Dashboard (#517). Funciones puras:
// - Periodos: rentabilidad por Dietz modificado de cada mes, trimestre y año
//   (la misma fórmula que el calendario, calendarioDietz.ts).
// - Riesgo: máxima caída del índice de rentabilidad encadenada (TWR, sin
//   depósitos ni retiradas; el mismo cálculo que la «Máx. caída» de
//   Evolución) con su recuperación, caída actual, volatilidad anualizada de
//   los rendimientos diarios y mejor y peor mes.

const pad = (n: number) => String(n).padStart(2, '0')
const ultimoDia = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const DAY_MS = 86_400_000
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS)

/** Días de un año para anualizar: el mercado cripto cotiza todos los días. */
export const DIAS_ANIO = 365

export interface FilaAnio {
  year: number
  meses: Array<TotalTramo | null>
  trimestres: Array<TotalTramo | null>
  anio: TotalTramo | null
}

/** Rejilla de periodos: una fila por año con sus 12 meses, 4 trimestres y el año, por Dietz. */
export function rejillaPeriodos(historia: readonly DiaValorado[]): FilaAnio[] {
  const conDato = historia.filter(d => d.complete || d.live)
  if (conDato.length === 0) return []
  const y0 = Number(conDato[0].date.slice(0, 4))
  const y1 = Number(conDato[conDato.length - 1].date.slice(0, 4))
  const filas: FilaAnio[] = []
  for (let y = y0; y <= y1; y++) {
    filas.push({
      year: y,
      meses: Array.from({ length: 12 }, (_, i) => totalTramo(historia, `${y}-${pad(i + 1)}-01`, `${y}-${pad(i + 1)}-${pad(ultimoDia(y, i + 1))}`)),
      trimestres: Array.from({ length: 4 }, (_, q) => totalTramo(historia, `${y}-${pad(q * 3 + 1)}-01`, `${y}-${pad(q * 3 + 3)}-${pad(ultimoDia(y, q * 3 + 3))}`)),
      anio: totalTramo(historia, `${y}-01-01`, `${y}-12-31`),
    })
  }
  return filas
}

export interface Caida {
  /** Caída en % (negativa) desde el máximo. */
  pct: number
  /** Día del máximo previo y del mínimo. */
  desde: string
  hasta: string
  /** Día en que se recuperó el máximo; null si sigue abierta. */
  recuperado: string | null
  diasCaida: number
  /** Días del mínimo a la recuperación; null si sigue abierta. */
  diasRecuperacion: number | null
  /** Subida necesaria desde el nivel actual para recuperar el máximo (si sigue abierta). */
  faltaPct: number | null
}

export interface Riesgo {
  maxima: Caida | null
  /** Distancia actual al último máximo (0 si se está en máximos). */
  actual: { pct: number; desde: string } | null
  volatilidadAnual: number | null
  volatilidadDiaria: number | null
  diasMedidos: number
}

/**
 * Medidas de riesgo de una serie de rendimientos diarios (%, null sin base),
 * los mismos que usa Evolución (`steps` de evolutionSummary.ts). El día en
 * curso cuenta en las caídas, como en Evolución, pero no en la volatilidad:
 * su rendimiento aún cambia.
 */
export function medidasRiesgo(dias: ReadonlyArray<{ date: string; pct: number | null; live?: boolean }>): Riesgo {
  const serie = dias
  let indice = 1
  let pico = 1
  let picoDia = serie[0]?.date ?? ''
  let peor: { pct: number; desde: string; hasta: string; picoIndice: number } | null = null
  // Recuperación del peor tramo: el primer día, tras su mínimo, que vuelve a su máximo.
  let recuperado: string | null = null
  const rendimientos: number[] = []
  for (const d of serie) {
    if (d.pct !== null) {
      indice *= 1 + d.pct / 100
      if (!d.live) rendimientos.push(d.pct / 100)
    }
    if (indice >= pico) {
      if (peor && recuperado === null && indice >= peor.picoIndice - 1e-12 && d.date > peor.hasta) recuperado = d.date
      if (indice > pico) { pico = indice; picoDia = d.date }
    }
    const dd = (indice / pico - 1) * 100
    if (dd < -0.005 && (!peor || dd < peor.pct)) {
      peor = { pct: dd, desde: picoDia, hasta: d.date, picoIndice: pico }
      recuperado = null
    }
  }
  const maxima: Caida | null = peor && {
    pct: peor.pct,
    desde: peor.desde,
    hasta: peor.hasta,
    recuperado,
    diasCaida: diasEntre(peor.desde, peor.hasta),
    diasRecuperacion: recuperado ? diasEntre(peor.hasta, recuperado) : null,
    faltaPct: recuperado ? null : (peor.picoIndice / indice - 1) * 100,
  }
  const actualPct = (indice / pico - 1) * 100
  const n = rendimientos.length
  const media = n ? rendimientos.reduce((s, r) => s + r, 0) / n : 0
  const varianza = n > 1 ? rendimientos.reduce((s, r) => s + (r - media) ** 2, 0) / (n - 1) : null
  const diaria = varianza === null ? null : Math.sqrt(varianza) * 100
  return {
    maxima,
    actual: serie.length ? { pct: Math.abs(actualPct) < 0.005 ? 0 : actualPct, desde: picoDia } : null,
    volatilidadDiaria: diaria,
    volatilidadAnual: diaria === null ? null : diaria * Math.sqrt(DIAS_ANIO),
    diasMedidos: n,
  }
}

/** Mejor y peor mes por Dietz entre los meses que tocan [from, to] (recortados al rango). */
export function extremosMeses(historia: readonly DiaValorado[], from: string, to: string): { mejor: (TotalTramo & { mes: string }) | null; peor: (TotalTramo & { mes: string }) | null } {
  let mejor: (TotalTramo & { mes: string }) | null = null
  let peor: (TotalTramo & { mes: string }) | null = null
  let y = Number(from.slice(0, 4))
  let m = Number(from.slice(5, 7))
  while (`${y}-${pad(m)}` <= to.slice(0, 7)) {
    const inicio = `${y}-${pad(m)}-01`
    const fin = `${y}-${pad(m)}-${pad(ultimoDia(y, m))}`
    const t = totalTramo(historia, inicio < from ? from : inicio, fin > to ? to : fin)
    // Los meses sin capital o con un % poco representativo no compiten (#517).
    if (t && t.fiable) {
      const mes = `${y}-${pad(m)}`
      if (!mejor || t.pct > mejor.pct) mejor = { ...t, mes }
      if (!peor || t.pct < peor.pct) peor = { ...t, mes }
    }
    m++
    if (m > 12) { m = 1; y++ }
  }
  return { mejor, peor }
}
