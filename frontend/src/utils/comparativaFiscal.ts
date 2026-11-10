import type { YearOverview } from '../pages/fiscal/types'

// Comparativa interanual (#539): una fila por año, del más reciente al más
// antiguo, con la métrica elegida. En «Resultado» la barra es divergente
// (pérdidas a la izquierda, ganancias a la derecha); en «Cuota» y
// «Operaciones», una barra desde cero. El año en curso es provisional.

export type MetricaAnual = 'resultado' | 'cuota' | 'operaciones'

export interface FilaAnual {
  year: number
  enCurso: boolean
  ganancias: number
  /** Siempre negativa o cero. */
  perdidas: number
  neto: number
  /** Valor de la métrica elegida. */
  valor: number
}

const valorDe = (o: YearOverview, m: MetricaAnual) => (m === 'resultado' ? o.netoPatrimonial : m === 'cuota' ? o.cuota : o.numOperaciones)

export function filasComparativa(overview: readonly YearOverview[], metrica: MetricaAnual): FilaAnual[] {
  return [...overview].sort((a, b) => b.year - a.year).map(o => ({
    year: o.year, enCurso: o.esAnioEnCurso, ganancias: o.totalGanancias, perdidas: -Math.abs(o.totalPerdidas),
    neto: o.netoPatrimonial, valor: valorDe(o, metrica),
  }))
}

/** Máximo de la escala: en «Resultado», el mayor de ganancias y pérdidas (simétrica); si no, el mayor valor. */
export function maxEscala(filas: readonly FilaAnual[], metrica: MetricaAnual): number {
  const m = metrica === 'resultado'
    ? Math.max(0, ...filas.flatMap(f => [f.ganancias, -f.perdidas]))
    : Math.max(0, ...filas.map(f => f.valor))
  return m > 0 ? m : 1
}

/** Ancho en % de un importe sobre la escala (0 a 100). */
export const pctEscala = (v: number, max: number) => Math.min(100, (Math.abs(v) / max) * 100)

export const ETIQUETAS_TIRA: Record<MetricaAnual, { mejor: string; peor: string; media: string }> = {
  resultado: { mejor: 'Mejor año', peor: 'Peor año', media: 'Media por año' },
  cuota: { mejor: 'Mayor cuota', peor: 'Menor cuota', media: 'Cuota media' },
  operaciones: { mejor: 'Más operaciones', peor: 'Menos operaciones', media: 'Media por año' },
}

/** Mejor, peor y media según la métrica; en empate gana el año más reciente. */
export function resumenComparativa(filas: readonly FilaAnual[]): { mejor: FilaAnual; peor: FilaAnual; media: number } | null {
  if (filas.length === 0) return null
  const mejor = filas.reduce((a, f) => (f.valor > a.valor ? f : a))
  const peor = filas.reduce((a, f) => (f.valor < a.valor ? f : a))
  return { mejor, peor, media: filas.reduce((t, f) => t + f.valor, 0) / filas.length }
}
