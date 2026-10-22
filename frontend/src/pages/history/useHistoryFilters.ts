import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCurrency } from '../../hooks/useDisplayCurrency'
import { DEFAULT_SORT, nextSort, type SortKey, type SortState } from './sorting'
import {
  EMPTY_FILTERS, hasActiveFilters as anyFilter, parseHistoryUrl, toApiParams, toHistoryUrl,
  type HistoryFilterState,
} from './urlState'

// Estado de filtros, orden y página del Historial (#351), guardado en la URL
// (#366): recargar o compartir el enlace restaura la misma vista. La búsqueda
// se aplica 250 ms después de dejar de teclear.

export const PAGE_SIZE = 50
export const SEARCH_DEBOUNCE_MS = 250
export type { HistoryFilterState }

export function useHistoryFilters() {
  const currency = useCurrency()
  const [params, setParams] = useSearchParams()
  const [initial] = useState(() => parseHistoryUrl(params))
  const [filters, setFilters] = useState<HistoryFilterState>(initial.filters)
  const [searchInput, setSearchInput] = useState(initial.filters.search)
  const [sort, setSort] = useState<SortState>(initial.sort)
  const [page, setPage] = useState(initial.page)
  // ?tx=<id> (enlace desde el Dashboard, #237) se conserva hasta el primer cambio.
  const [focusTx, setFocusTx] = useState<string | null>(params.get('tx'))
  const lastWritten = useRef(params.toString())

  // Búsqueda con debounce: una sola petición al dejar de teclear.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters(prev => {
        if (prev.search === searchInput) return prev
        setPage(1)
        return { ...prev, search: searchInput }
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Estado → URL (replace: el botón Atrás sale de Historial, no deshace filtros).
  useEffect(() => {
    const next = toHistoryUrl({ filters, sort, page })
    if (focusTx) next.set('tx', focusTx)
    const text = next.toString()
    if (text !== lastWritten.current) {
      lastWritten.current = text
      setParams(next, { replace: true })
    }
  }, [filters, sort, page, focusTx, setParams])

  // URL → estado, solo si cambia desde fuera (un enlace estando ya en Historial).
  useEffect(() => {
    const text = params.toString()
    if (text === lastWritten.current) return
    lastWritten.current = text
    const parsed = parseHistoryUrl(params)
    setFilters(parsed.filters)
    setSearchInput(parsed.filters.search)
    setSort(parsed.sort)
    setPage(parsed.page)
    setFocusTx(params.get('tx'))
  }, [params])

  /** Cambiar cualquier filtro vuelve a la primera página. */
  const setFilter = useCallback(<K extends keyof HistoryFilterState>(key: K, value: HistoryFilterState[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    if (key === 'search') setSearchInput(value as string)
    setPage(1)
    setFocusTx(null)
  }, [])
  const patchFilters = useCallback((patch: Partial<HistoryFilterState>) => {
    setFilters(prev => ({ ...prev, ...patch }))
    if (patch.search !== undefined) setSearchInput(patch.search)
    setPage(1)
    setFocusTx(null)
  }, [])
  const setDateRange = useCallback((from: string, to: string) => patchFilters({ date_from: from, date_to: to }), [patchFilters])
  const setOffset = useCallback((offset: number) => { setPage(Math.floor(offset / PAGE_SIZE) + 1); setFocusTx(null) }, [])
  const clearImport = useCallback(() => patchFilters({ import_id: '' }), [patchFilters])
  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS); setSearchInput(''); setSort(DEFAULT_SORT); setPage(1); setFocusTx(null)
  }, [])
  const toggleSort = useCallback((col: SortKey) => { setSort(s => nextSort(s, col)); setPage(1); setFocusTx(null) }, [])

  const offset = (page - 1) * PAGE_SIZE
  const queryParams = useMemo(() => toApiParams(filters, sort, offset, PAGE_SIZE, currency), [filters, sort, offset, currency])

  return {
    filters, searchInput, sort, page, offset, queryParams, focusTx,
    hasActiveFilters: anyFilter(filters),
    setFilter, patchFilters, setSearchInput, setDateRange, setOffset, clearImport, clearFilters, toggleSort,
  }
}
