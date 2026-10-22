import type { SavedView } from '../../api/portfolio'
import { DEFAULT_SORT, type SortState } from './sorting'
import { EMPTY_FILTERS, toApiParams, type HistoryFilterState } from './urlState'

// Vistas guardadas del Historial (#369): conversión entre el estado de los
// filtros y los filtros de una vista (nombres de la API), y detección de la
// vista activa. Funciones puras.

/** Filtros de la vista a partir del estado actual: sin página ni moneda. */
export function viewFiltersFromState(filters: HistoryFilterState, sort: SortState): Record<string, string> {
  const params: Record<string, string> = { ...toApiParams(filters, sort, 0, 50, 'EUR') }
  for (const k of ['limit', 'offset', 'currency']) delete params[k]
  return params
}

const list = (v: string | undefined) => (v ? v.split(',').map(x => x.trim()).filter(Boolean) : [])

/** Estado de filtros y orden de una vista (el backend ya la validó al guardarla). */
export function stateFromView(filtros: Record<string, string>): { filters: HistoryFilterState; sort: SortState } {
  const f = filtros
  const sortKey = f.sort as SortState['key'] | undefined
  return {
    filters: {
      ...EMPTY_FILTERS,
      search: f.search ?? '',
      types: list(f.type),
      assets: list(f.asset).map(a => a.toUpperCase()),
      wallet_id: f.wallet_id ?? '',
      account: f.account ?? '',
      date_from: f.date_from ?? '',
      date_to: f.date_to ?? '',
      manualOnly: f.manually_added === 'true',
      import_id: f.import_id ?? '',
      value_min: f.value_min ?? '',
      value_max: f.value_max ?? '',
      groupFees: f.group_fees !== 'false',
    },
    sort: sortKey && ['fecha', 'valor', 'activo', 'tipo'].includes(sortKey)
      ? { key: sortKey, dir: f.dir === 'asc' ? 'asc' : 'desc' }
      : DEFAULT_SORT,
  }
}

/** Forma canónica de unos filtros: claves ordenadas y listas sin orden ni repetidos. */
function canonical(filtros: Record<string, string>): string {
  const norm: Record<string, string> = { sort: DEFAULT_SORT.key, dir: DEFAULT_SORT.dir }
  for (const [k, v] of Object.entries(filtros)) {
    if (v === '' || k === 'limit' || k === 'offset' || k === 'currency') continue
    norm[k] = k === 'type' || k === 'asset' ? [...new Set(list(v).map(x => (k === 'asset' ? x.toUpperCase() : x)))].sort().join(',') : v
  }
  return JSON.stringify(Object.keys(norm).sort().map(k => [k, norm[k]]))
}

/** Vista cuyos filtros y orden coinciden exactamente con el estado actual, si la hay. */
export function activeView(views: readonly SavedView[], filters: HistoryFilterState, sort: SortState): SavedView | null {
  const current = canonical(viewFiltersFromState(filters, sort))
  return views.find(v => canonical(v.filtros) === current) ?? null
}
