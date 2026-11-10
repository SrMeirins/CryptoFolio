import type { BreakdownItem } from '../pages/fiscal/types'
import { pasoRedondo } from './fiscalCharts'

// Desglose por activo (#540): ranking con peso, orden y filtros, «Otros» y
// la cascada de contribución hasta el neto del ejercicio. Funciones puras.

export interface FilaActivo {
  asset: string
  ganancias: number
  /** Siempre negativa o cero. */
  perdidas: number
  neto: number
  operaciones: number
  /** Parte del movimiento del año: (ganancias + |pérdidas|) sobre el total, en %. */
  peso: number
}

const movimiento = (i: Pick<BreakdownItem, 'ganancias' | 'perdidas'>) => i.ganancias + Math.abs(i.perdidas)

export function filasRanking(items: readonly BreakdownItem[]): FilaActivo[] {
  const total = items.reduce((t, i) => t + movimiento(i), 0)
  return items.map(i => ({
    asset: i.asset, ganancias: i.ganancias, perdidas: -Math.abs(i.perdidas), neto: i.neto, operaciones: i.operaciones,
    peso: total > 0 ? (movimiento(i) / total) * 100 : 0,
  }))
}

export type ClaveOrden = 'asset' | 'neto' | 'peso' | 'operaciones'
export type Direccion = 'asc' | 'desc'

/** Orden estable; en empate, por activo. */
export function ordenarRanking(filas: readonly FilaActivo[], clave: ClaveOrden, dir: Direccion): FilaActivo[] {
  const s = dir === 'asc' ? 1 : -1
  return [...filas].sort((a, b) => {
    const d = clave === 'asset' ? a.asset.localeCompare(b.asset) : a[clave] - b[clave]
    return d !== 0 ? d * s : a.asset.localeCompare(b.asset)
  })
}

export type FiltroSigno = 'todos' | 'ganancia' | 'perdida'

export function filtrarRanking(filas: readonly FilaActivo[], texto: string, signo: FiltroSigno): FilaActivo[] {
  const q = texto.trim().toUpperCase()
  return filas.filter(f => (!q || f.asset.toUpperCase().includes(q))
    && (signo === 'todos' || (signo === 'ganancia' ? f.neto > 0.005 : f.neto < -0.005)))
}

/** Los `top` primeros y el resto, que va en «Otros» desplegable. */
export function separarOtros<T>(filas: readonly T[], top = 8): { principales: T[]; otros: T[] } {
  return filas.length <= top + 1 ? { principales: [...filas], otros: [] } : { principales: filas.slice(0, top), otros: filas.slice(top) }
}

export function totalesRanking(filas: readonly FilaActivo[]): { neto: number; operaciones: number; activos: number } {
  return { neto: filas.reduce((t, f) => t + f.neto, 0), operaciones: filas.reduce((t, f) => t + f.operaciones, 0), activos: filas.length }
}

export interface PasoContribucion {
  clave: string
  /** Nombre del activo, «Otros» o «Neto del ejercicio». */
  label: string
  /** Activos agrupados en «Otros». */
  agrupados?: number
  importe: number
  desde: number
  hasta: number
  total: boolean
}

/**
 * Cascada de contribución: los `top` activos con más neto (en valor absoluto)
 * y el resto en «Otros»; primero los que suman, de mayor a menor, y después
 * los que restan. Cada paso empieza donde acabó el anterior y el último es el
 * neto del ejercicio, la suma exacta de todos los activos.
 */
export function cascadaContribucion(items: readonly BreakdownItem[], top = 8): { pasos: PasoContribucion[]; min: number; max: number } {
  const porMagnitud = [...items].sort((a, b) => Math.abs(b.neto) - Math.abs(a.neto) || a.asset.localeCompare(b.asset))
  const { principales, otros } = separarOtros(porMagnitud, top)
  const grupos: Array<{ clave: string; label: string; importe: number; agrupados?: number }> = principales.map(i => ({ clave: i.asset, label: i.asset, importe: i.neto }))
  if (otros.length > 0) grupos.push({ clave: '__otros', label: 'Otros', importe: otros.reduce((t, i) => t + i.neto, 0), agrupados: otros.length })
  const suman = grupos.filter(g => g.importe >= 0).sort((a, b) => b.importe - a.importe)
  const restan = grupos.filter(g => g.importe < 0).sort((a, b) => a.importe - b.importe)
  const pasos: PasoContribucion[] = []
  let acc = 0
  for (const g of [...suman, ...restan]) {
    pasos.push({ ...g, desde: acc, hasta: acc + g.importe, total: false })
    acc += g.importe
  }
  // El total es la suma de todos los activos, no el acumulado redondeado de los pasos.
  const neto = items.reduce((t, i) => t + i.neto, 0)
  pasos.push({ clave: '__neto', label: 'Neto del ejercicio', importe: neto, desde: 0, hasta: neto, total: true })
  const extremos = pasos.flatMap(p => [p.desde, p.hasta])
  return { pasos, min: Math.min(0, ...extremos), max: Math.max(0, ...extremos) }
}

/** Tramo de una barra de la cascada en % de la escala [min, max]. */
export function tramoBarra(p: Pick<PasoContribucion, 'desde' | 'hasta'>, min: number, max: number): { left: number; width: number } {
  const rango = max - min
  if (rango <= 0) return { left: 0, width: 0 }
  const a = Math.min(p.desde, p.hasta), b = Math.max(p.desde, p.hasta)
  return { left: ((a - min) / rango) * 100, width: ((b - a) / rango) * 100 }
}

/**
 * Escala de la cascada con marcas redondas (#540): amplía [min, max] hasta
 * múltiplos de un paso redondo para que la rejilla y las etiquetas caigan en
 * cifras limpias. Incluye siempre el cero.
 */
export function escalaCascada(min: number, max: number, marcas = 6): { min: number; max: number; ticks: number[] } {
  const lo = Math.min(0, min), hi = Math.max(0, max)
  if (hi - lo <= 0) return { min: 0, max: 1, ticks: [0, 1] }
  const paso = pasoRedondo((hi - lo) / marcas)
  const a = Math.floor(lo / paso) * paso, b = Math.ceil(hi / paso) * paso
  const ticks: number[] = []
  // Se redondea cada marca para no arrastrar errores de coma flotante (0,30000000000000004).
  for (let v = a; v <= b + paso / 2; v += paso) ticks.push(Math.round(v / paso) * paso)
  return { min: a, max: b, ticks }
}
