// Mini-gráfico de tendencia de la tarjeta «Valor» (#251). Funciones puras: la
// serie de los últimos días y su trazado en un SVG de tamaño fijo.

export interface SparkDay { date: string; value: number; live: boolean }

/**
 * Valor de la cartera de los últimos `days` días; el día en curso se sustituye
 * por el valor en vivo para que la punta se mueva con los precios.
 */
export function valueSparkline(series: readonly SparkDay[], liveValue: number | null, days = 30): number[] {
  const tail = series.slice(-days).map(d => d.value)
  const last = series[series.length - 1]
  if (last?.live && liveValue !== null && tail.length > 0) tail[tail.length - 1] = liveValue
  return tail
}

/** Puntos «x,y» del trazado, con un margen vertical; '' si no hay al menos dos valores. */
export function sparklinePoints(values: readonly number[], width: number, height: number, pad = 2): string {
  if (values.length < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = width / (values.length - 1)
  return values
    .map((v, i) => `${(i * step).toFixed(1)},${(pad + (1 - (v - min) / span) * (height - 2 * pad)).toFixed(1)}`)
    .join(' ')
}

/** Variación porcentual entre el primer y el último valor; null sin datos o base 0. */
export function sparklineChange(values: readonly number[]): number | null {
  if (values.length < 2 || values[0] === 0) return null
  return ((values[values.length - 1] - values[0]) / Math.abs(values[0])) * 100
}

/**
 * P&L de los últimos `days` días para la mini gráfica de la tarjeta P&L (#412):
 * se reconstruye hacia atrás desde la cifra actual restando el P&L de cada día,
 * así que la punta coincide con la tarjeta. Solo da la forma de la tendencia.
 */
export function pnlSparkline(series: readonly { pnl: number }[], current: number | null, days = 30): number[] {
  if (current === null) return []
  const tail = series.slice(-days)
  const out = new Array<number>(tail.length)
  let acc = current
  for (let i = tail.length - 1; i >= 0; i--) {
    out[i] = acc
    acc -= tail[i].pnl
  }
  return out
}

/** Rentabilidad acumulada de los últimos `days` días, para la tarjeta Rentabilidad (#412). */
export function returnSparkline(series: readonly { cumulativePct: number }[], days = 30): number[] {
  return series.slice(-days).map(d => d.cumulativePct)
}
