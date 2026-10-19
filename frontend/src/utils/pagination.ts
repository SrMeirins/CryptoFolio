// Paginación genérica (#299). Función pura.

export const PAGE_SIZES = [25, 50, 100] as const
export type PageSize = typeof PAGE_SIZES[number]

export interface Page<T> {
  items: T[]
  /** Página efectiva (1-based), recortada si el total ha encogido. */
  page: number
  pages: number
  /** Posiciones 1-based del primer y último elemento mostrados; 0 sin elementos. */
  from: number
  to: number
  total: number
}

export function paginate<T>(all: readonly T[], page: number, size: number): Page<T> {
  const total = all.length
  const pages = Math.max(1, Math.ceil(total / size))
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages)
  const start = (p - 1) * size
  const items = all.slice(start, start + size)
  return { items, page: p, pages, from: total === 0 ? 0 : start + 1, to: start + items.length, total }
}
