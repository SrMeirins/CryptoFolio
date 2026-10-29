import { useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PAGE_SIZE } from '../useHistoryFilters'
import { detailQuery } from './detailQuery'
import { detailNeighbors } from './detailLinks'

// Navegación del panel de detalle (#373): Anterior/Siguiente en el orden de la
// lista (pasando de página si hace falta) y precarga del detalle de las filas
// al pasar por ellas y de los vecinos de la abierta, para que abrir sea inmediato.

type Target = { id: string } | { page: 'prev' | 'next' } | null

export function useDetailNavigation({ ids, current, offset, total, open, setOffset, pageIds }: {
  ids: readonly string[]
  current: string | null
  offset: number
  total: number
  open: (id: string) => void
  setOffset: (offset: number, tx: string | null) => void
  pageIds: (offset: number) => Promise<string[]>
}) {
  const queryClient = useQueryClient()
  const prefetch = useCallback((id: string) => { void queryClient.prefetchQuery(detailQuery(id)) }, [queryClient])

  const { prev, next } = current
    ? detailNeighbors(ids, current, { offset, pageSize: PAGE_SIZE, total })
    : { prev: null, next: null }

  const prevId = prev && 'id' in prev ? prev.id : null
  const nextId = next && 'id' in next ? next.id : null
  useEffect(() => {
    if (prevId) prefetch(prevId)
    if (nextId) prefetch(nextId)
  }, [prevId, nextId, prefetch])

  function go(target: Target): (() => void) | null {
    if (!target) return null
    if ('id' in target) return () => open(target.id)
    const pageOffset = target.page === 'prev' ? offset - PAGE_SIZE : offset + PAGE_SIZE
    return () => {
      void pageIds(pageOffset).then(list => {
        const id = target.page === 'prev' ? list[list.length - 1] : list[0]
        if (id) setOffset(pageOffset, id)
      })
    }
  }

  return { prefetch, prev: go(prev), next: go(next) }
}
