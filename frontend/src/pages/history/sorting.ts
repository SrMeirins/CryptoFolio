// Orden del Historial en el servidor (#349) y URL de la exportación CSV.

export type SortKey = 'fecha' | 'valor' | 'activo' | 'tipo'
export type SortDir = 'asc' | 'desc'
export interface SortState { key: SortKey; dir: SortDir }

export const DEFAULT_SORT: SortState = { key: 'fecha', dir: 'desc' }

/** Pulsar una columna: invierte el sentido si ya ordena por ella; si no, la ordena descendente. */
export function nextSort(current: SortState, col: SortKey): SortState {
  if (current.key === col) return { key: col, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  return { key: col, dir: 'desc' }
}

/** Valor de aria-sort de la cabecera de una columna. */
export function ariaSort(current: SortState, col: SortKey): 'ascending' | 'descending' | 'none' {
  if (current.key !== col) return 'none'
  return current.dir === 'asc' ? 'ascending' : 'descending'
}

/** Solo ordenando por fecha tiene sentido agrupar por día. */
export function groupsByDay(current: SortState): boolean {
  return current.key === 'fecha'
}

/**
 * URL de GET /transactions/export.csv con los mismos filtros y orden que el
 * listado, sin paginación ni moneda (el CSV trae EUR y USD).
 */
export function exportCsvUrl(params: Record<string, string>): string {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([k, v]) => v !== '' && !['limit', 'offset', 'currency'].includes(k)),
  ).toString()
  return `/api/transactions/export.csv${qs ? `?${qs}` : ''}`
}
