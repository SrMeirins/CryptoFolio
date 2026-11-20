import type { ByCategory, StatsCategory } from '../api/portfolio'

// Mapa de actividad de 26 semanas del Dashboard (#516): un cuadro por día de
// la zona de la app, coloreado por el tipo con más operaciones ese día (a
// igualdad, el de más valor) e intensidad según el número de operaciones.
// Columnas = semanas (de lunes a domingo), filas = días de la semana.
// Funciones puras.

export interface Celda {
  day: string
  total: number
  dominante: StatsCategory | null
  ops: ByCategory | null
}

export const CATEGORIA_LABEL: Record<StatsCategory, { uno: string; varios: string }> = {
  compras: { uno: 'compra', varios: 'compras' },
  ventas: { uno: 'venta', varios: 'ventas' },
  otras_salidas: { uno: 'otra salida', varios: 'otras salidas' },
  ingresos: { uno: 'ingreso', varios: 'ingresos' },
  transferencias: { uno: 'movimiento', varios: 'movimientos' },
  otros: { uno: 'otra', varios: 'otras' },
}

const DAY_MS = 86_400_000
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`)
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
export const sumarDias = (d: string, n: number) => iso(ms(d) + n * DAY_MS)
/** 0 = lunes … 6 = domingo. */
export const diaSemana = (d: string) => (new Date(ms(d)).getUTCDay() + 6) % 7

/** Tipo dominante: el de más operaciones; a igualdad, el de más valor. */
export function dominante(ops: ByCategory, valor: ByCategory): StatsCategory | null {
  let mejor: StatsCategory | null = null
  for (const k of Object.keys(ops) as StatsCategory[]) {
    if (ops[k] <= 0) continue
    if (!mejor || ops[k] > ops[mejor] || (ops[k] === ops[mejor] && (valor[k] ?? 0) > (valor[mejor] ?? 0))) mejor = k
  }
  return mejor
}

/**
 * Semanas del mapa, de la más antigua a la actual: cada una con sus 7 días
 * (lunes a domingo). Los días posteriores a hoy van como null.
 */
export function semanasMapa(
  buckets: ReadonlyArray<{ periodo: string; ops: ByCategory; valor: { EUR: ByCategory } }>,
  today: string,
  semanas = 26,
): Array<Array<Celda | null>> {
  const porDia = new Map(buckets.map(b => [b.periodo, b]))
  const lunesActual = sumarDias(today, -diaSemana(today))
  const inicio = sumarDias(lunesActual, -(semanas - 1) * 7)
  return Array.from({ length: semanas }, (_, w) => Array.from({ length: 7 }, (_, d) => {
    const day = sumarDias(inicio, w * 7 + d)
    if (day > today) return null
    const b = porDia.get(day)
    const total = b ? Object.values(b.ops).reduce((s, n) => s + n, 0) : 0
    return { day, total, dominante: b ? dominante(b.ops, b.valor.EUR) : null, ops: b?.ops ?? null }
  }))
}

/** Intensidad 0 a 4 según las operaciones del día frente al día con más. */
export function nivel(total: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (total <= 0 || max <= 0) return 0
  const r = total / max
  return r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1
}

/** Desglose legible: «3 compras y 1 ingreso». */
export function desglose(ops: ByCategory | null): string {
  if (!ops) return 'sin operaciones'
  const partes = (Object.keys(ops) as StatsCategory[]).filter(k => ops[k] > 0)
    .sort((a, b) => ops[b] - ops[a])
    .map(k => `${ops[k]} ${ops[k] === 1 ? CATEGORIA_LABEL[k].uno : CATEGORIA_LABEL[k].varios}`)
  if (partes.length === 0) return 'sin operaciones'
  return partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}

/** Movimiento del día activo con el teclado: arriba y abajo, día a día; izquierda y derecha, semana a semana. */
export function moverDia(day: string, key: string, desde: string, hasta: string): string | null {
  const delta: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }
  let next: string | null = null
  if (key in delta) next = sumarDias(day, delta[key])
  else if (key === 'Home') next = desde
  else if (key === 'End') next = hasta
  if (!next || next < desde || next > hasta) return null
  return next
}
