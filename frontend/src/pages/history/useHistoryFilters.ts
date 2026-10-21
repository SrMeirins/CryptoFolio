import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DEFAULT_SORT, nextSort, type SortKey, type SortState } from './sorting'

// Estado de filtros, orden y página del Historial (#351), y los parámetros de
// la consulta que se derivan de él.

export const PAGE_SIZE = 50

export interface HistoryFilters {
  asset: string; account: string; type: string; wallet_id: string
  manualOnly: boolean; date_from: string; date_to: string; search: string; offset: number
  /** Transacciones de una importación (#324), desde su resultado o la lista de importaciones. */
  import_id: string
}
const INITIAL: HistoryFilters = {
  asset: '', account: '', type: '', wallet_id: '',
  manualOnly: false, date_from: '', date_to: '', search: '', offset: 0, import_id: '',
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function useHistoryFilters() {
  // ?buscar=XRP&tx=<id> llega desde la actividad reciente del Dashboard (#237);
  // ?import=<id> desde el resultado o la lista de importaciones (#324).
  const [params, setParams] = useSearchParams()
  const focusTx = params.get('tx')
  const [filters, setFilters] = useState<HistoryFilters>(() => {
    const imp = params.get('import') ?? ''
    return { ...INITIAL, search: params.get('buscar') ?? '', import_id: UUID_RE.test(imp) ? imp : '' }
  })
  // Orden en el servidor (#349): abarca todas las páginas, no solo la visible.
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT)

  const queryParams = useMemo(() => ({
    limit:  String(PAGE_SIZE),
    offset: String(filters.offset),
    ...(filters.asset      ? { asset:          filters.asset.toUpperCase() } : {}),
    ...(filters.account    ? { account:        filters.account }             : {}),
    ...(filters.type       ? { type:           filters.type }                : {}),
    ...(filters.wallet_id  ? { wallet_id:      filters.wallet_id }           : {}),
    ...(filters.date_from  ? { date_from:      filters.date_from }           : {}),
    ...(filters.date_to    ? { date_to:        filters.date_to }             : {}),
    ...(filters.search     ? { search:         filters.search }              : {}),
    ...(filters.manualOnly ? { manually_added: 'true' }                      : {}),
    ...(filters.import_id  ? { import_id:      filters.import_id }           : {}),
    sort: sort.key,
    dir:  sort.dir,
  }), [filters, sort])

  /** Cambiar cualquier filtro vuelve a la primera página. */
  const setFilter = useCallback(<K extends keyof HistoryFilters>(key: K, value: HistoryFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value, ...(key !== 'offset' ? { offset: 0 } : {}) }))
  }, [])
  const setDateRange = useCallback((from: string, to: string) => {
    setFilters(prev => ({ ...prev, date_from: from, date_to: to, offset: 0 }))
  }, [])
  const setOffset = useCallback((offset: number) => setFilters(prev => ({ ...prev, offset })), [])

  const clearImport = useCallback(() => {
    setFilters(prev => ({ ...prev, import_id: '', offset: 0 }))
    if (params.has('import')) { const p = new URLSearchParams(params); p.delete('import'); setParams(p, { replace: true }) }
  }, [params, setParams])

  const clearFilters = useCallback(() => {
    clearImport(); setFilters(INITIAL); setSort(DEFAULT_SORT)
  }, [clearImport])

  const toggleSort = useCallback((col: SortKey) => {
    setSort(s => nextSort(s, col))
    setFilters(prev => ({ ...prev, offset: 0 }))
  }, [])

  const hasActiveFilters = !!(filters.asset || filters.account || filters.type || filters.wallet_id ||
    filters.manualOnly || filters.date_from || filters.date_to || filters.search || filters.import_id)

  return {
    filters, sort, queryParams, hasActiveFilters, focusTx,
    setFilter, setDateRange, setOffset, clearImport, clearFilters, toggleSort,
  }
}
