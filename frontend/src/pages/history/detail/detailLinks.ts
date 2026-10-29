// Enlaces y navegación del panel de detalle (#373). Funciones puras.

/** Fiscal del año del evento, en la vista de operaciones. */
export const fiscalLink = (year: number) => `/fiscal?anio=${year}&vista=operaciones`
/** El activo en Portfolio (abre su panel de detalle). */
export const portfolioLink = (asset: string) => `/portfolio?activo=${encodeURIComponent(asset)}`
/** Historial filtrado por un archivo de importación. */
export const importHistoryLink = (importId: string) => `/history?importacion=${encodeURIComponent(importId)}`

/**
 * Vecinos de una transacción en la lista visible: el anterior y el siguiente,
 * o si hay que pasar de página para encontrarlos. null si no hay más.
 */
export function detailNeighbors(ids: readonly string[], current: string, page: { offset: number; pageSize: number; total: number }): {
  prev: { id: string } | { page: 'prev' } | null
  next: { id: string } | { page: 'next' } | null
} {
  const i = ids.indexOf(current)
  if (i < 0) return { prev: null, next: null }
  const prev = i > 0 ? { id: ids[i - 1] } : page.offset > 0 ? { page: 'prev' as const } : null
  const next = i < ids.length - 1 ? { id: ids[i + 1] } : page.offset + page.pageSize < page.total ? { page: 'next' as const } : null
  return { prev, next }
}
