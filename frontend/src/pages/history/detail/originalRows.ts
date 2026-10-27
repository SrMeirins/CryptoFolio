import type { OriginalRows } from '../../../api/portfolio'

// Filas originales del CSV en el detalle (#374).

/** Filas visibles antes de «Mostrar las N filas». */
export const VISIBLE_ROWS = 5

/** Índices de las columnas con algún valor: las vacías en todas las filas se ocultan. */
export function usedColumns(table: OriginalRows): number[] {
  return table.columns.map((_, i) => i).filter(i => table.rows.some(r => (r[i] ?? '').trim() !== ''))
}
