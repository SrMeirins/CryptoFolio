// Mapa de árbol cuadrado («squarified treemap», Bruls et al.) para el mapa de
// calor de la cartera (#233). Reparte un rectángulo en celdas de área
// proporcional a cada valor, procurando que sean lo más cuadradas posible.
// Devuelve coordenadas en porcentaje del contenedor, para pintarlas con CSS.

export interface Rect { x: number; y: number; w: number; h: number }

function worst(row: readonly number[], side: number): number {
  const sum = row.reduce((s, v) => s + v, 0)
  const max = Math.max(...row)
  const min = Math.min(...row)
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min))
}

/**
 * `values` en orden descendente (los no positivos ocupan 0). `width` y
 * `height` dan la proporción del contenedor; el resultado va en % (0–100).
 */
export function squarify(values: readonly number[], width: number, height: number): Rect[] {
  const total = values.reduce((s, v) => s + Math.max(0, v), 0)
  const rects: Rect[] = values.map(() => ({ x: 0, y: 0, w: 0, h: 0 }))
  if (total <= 0 || width <= 0 || height <= 0) return rects
  const scale = (width * height) / total
  const areas = values.map(v => Math.max(0, v) * scale)

  let x = 0, y = 0, w = width, h = height
  let i = 0
  while (i < areas.length) {
    const side = Math.min(w, h)
    const row = [areas[i]]
    let j = i + 1
    while (j < areas.length && areas[j] > 0 && worst([...row, areas[j]], side) <= worst(row, side)) row.push(areas[j++])
    const rowArea = row.reduce((s, a) => s + a, 0)
    if (w >= h) {
      // Columna a la izquierda del espacio libre.
      const colW = rowArea / h
      let cy = y
      row.forEach((a, k) => { const ch = a / colW; rects[i + k] = { x, y: cy, w: colW, h: ch }; cy += ch })
      x += colW; w -= colW
    } else {
      // Fila en la parte superior del espacio libre.
      const rowH = rowArea / w
      let cx = x
      row.forEach((a, k) => { const cw = a / rowH; rects[i + k] = { x: cx, y, w: cw, h: rowH }; cx += cw })
      y += rowH; h -= rowH
    }
    i = j
    if (row.length === 1 && areas[i - 1] === 0) break
  }
  return rects.map(r => ({ x: (r.x / width) * 100, y: (r.y / height) * 100, w: (r.w / width) * 100, h: (r.h / height) * 100 }))
}

/**
 * Valores ajustados para que ninguna celda baje de `minShare` del total (#233):
 * las pequeñas suben al mínimo y el resto se reparte en proporción a su valor.
 * Así toda celda tiene sitio para sus siglas; las grandes conservan su orden.
 */
export function withMinShare(values: readonly number[], minShare: number): number[] {
  const total = values.reduce((s, v) => s + Math.max(0, v), 0)
  if (total <= 0 || values.length === 0) return values.map(() => 0)
  const floor = Math.min(minShare, 1 / values.length)
  const small = new Set<number>()
  // Se repite porque al reescalar las grandes alguna puede caer bajo el mínimo.
  for (;;) {
    const bigTotal = values.reduce((s, v, i) => (small.has(i) ? s : s + Math.max(0, v)), 0)
    const bigShare = 1 - small.size * floor
    let changed = false
    values.forEach((v, i) => {
      if (!small.has(i) && (Math.max(0, v) / bigTotal) * bigShare < floor) { small.add(i); changed = true }
    })
    if (!changed) {
      return values.map((v, i) => (small.has(i) ? floor : (Math.max(0, v) / bigTotal) * bigShare) * total)
    }
  }
}

export type CellTier = 'xl' | 'lg' | 'md' | 'sm'

/** Nivel de detalle de una celda según su tamaño en píxeles: nunca se queda sin siglas. */
export function cellTier(widthPx: number, heightPx: number): CellTier {
  if (widthPx >= 150 && heightPx >= 100) return 'xl'
  if (widthPx >= 95 && heightPx >= 64) return 'lg'
  if (widthPx >= 56 && heightPx >= 40) return 'md'
  return 'sm'
}
