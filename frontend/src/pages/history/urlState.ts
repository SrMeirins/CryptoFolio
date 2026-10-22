import { OP_META } from '../../constants/operations'
import { DEFAULT_SORT, type SortKey, type SortState } from './sorting'

// Estado del Historial en la URL (#366), con nombres en castellano como Fiscal
// y Ajustes. La URL viene del usuario: cada valor se valida igual que en la API
// y lo inválido se ignora en silencio (nunca rompe la vista). Funciones puras.

export interface HistoryFilterState {
  search: string
  types: string[]
  assets: string[]
  wallet_id: string
  account: string
  date_from: string
  date_to: string
  manualOnly: boolean
  import_id: string
  /** Importes en la moneda de visualización, como texto con punto decimal. */
  value_min: string
  value_max: string
}

export interface HistoryUrlState {
  filters: HistoryFilterState
  sort: SortState
  /** Página (desde 1). */
  page: number
}

export const EMPTY_FILTERS: HistoryFilterState = {
  search: '', types: [], assets: [], wallet_id: '', account: '', date_from: '', date_to: '',
  manualOnly: false, import_id: '', value_min: '', value_max: '',
}

export const MAX_LIST = 30
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ASSET_RE = /^[A-Za-z0-9._-]{1,32}$/
const AMOUNT_RE = /^\d{1,13}(\.\d{1,8})?$/
const SORT_KEYS: readonly SortKey[] = ['fecha', 'valor', 'activo', 'tipo']

function isDay(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

/** Lista separada por comas, sin vacíos ni repetidos, solo con valores válidos y como mucho MAX_LIST. */
function list(raw: string | null, valid: (v: string) => boolean, normalize: (v: string) => string = v => v): string[] {
  if (!raw) return []
  return [...new Set(raw.split(',').map(x => normalize(x.trim())).filter(x => x && valid(x)))].slice(0, MAX_LIST)
}

/** Importe válido (texto); se descarta si no lo es. */
export function cleanAmount(v: string | null): string {
  const t = (v ?? '').trim().replace(',', '.')
  return AMOUNT_RE.test(t) ? t : ''
}

export function parseHistoryUrl(params: URLSearchParams): HistoryUrlState {
  const g = (k: string) => params.get(k)
  const desde = g('desde') ?? '', hasta = g('hasta') ?? ''
  const min = cleanAmount(g('min')), max = cleanAmount(g('max'))
  const filters: HistoryFilterState = {
    search: (g('buscar') ?? '').slice(0, 100),
    types: list(g('tipo'), v => v in OP_META),
    assets: list(g('activo'), v => ASSET_RE.test(v), v => v.toUpperCase()),
    wallet_id: UUID_RE.test(g('wallet') ?? '') ? g('wallet')! : '',
    account: (g('cuenta') ?? '').trim().slice(0, 64),
    date_from: isDay(desde) ? desde : '',
    date_to: isDay(hasta) ? hasta : '',
    manualOnly: g('manuales') === '1',
    // «import» es el nombre antiguo (#324): los enlaces existentes siguen funcionando.
    import_id: [g('importacion'), g('import')].find(v => UUID_RE.test(v ?? '')) ?? '',
    value_min: min,
    value_max: max,
  }
  // Rangos invertidos: se descarta el extremo «hasta» antes que romper la consulta.
  if (filters.date_from && filters.date_to && filters.date_from > filters.date_to) filters.date_to = ''
  if (min && max && Number(min) > Number(max)) filters.value_max = ''

  const orden = g('orden') as SortKey | null
  const sort: SortState = orden && SORT_KEYS.includes(orden)
    ? { key: orden, dir: g('dir') === 'asc' ? 'asc' : 'desc' }
    : DEFAULT_SORT
  const pageNum = Number(g('pagina'))
  const page = Number.isInteger(pageNum) && pageNum >= 1 && pageNum <= 100_000 ? pageNum : 1
  return { filters, sort, page }
}

/** URL del estado: solo lo que difiere del valor por defecto, en un orden estable. */
export function toHistoryUrl({ filters: f, sort, page }: HistoryUrlState): URLSearchParams {
  const p = new URLSearchParams()
  if (f.search) p.set('buscar', f.search)
  if (f.types.length) p.set('tipo', f.types.join(','))
  if (f.assets.length) p.set('activo', f.assets.join(','))
  if (f.wallet_id) p.set('wallet', f.wallet_id)
  if (f.account) p.set('cuenta', f.account)
  if (f.date_from) p.set('desde', f.date_from)
  if (f.date_to) p.set('hasta', f.date_to)
  if (f.manualOnly) p.set('manuales', '1')
  if (f.import_id) p.set('importacion', f.import_id)
  if (f.value_min) p.set('min', f.value_min)
  if (f.value_max) p.set('max', f.value_max)
  if (sort.key !== DEFAULT_SORT.key || sort.dir !== DEFAULT_SORT.dir) { p.set('orden', sort.key); p.set('dir', sort.dir) }
  if (page > 1) p.set('pagina', String(page))
  return p
}

export function hasActiveFilters(f: HistoryFilterState): boolean {
  return !!(f.search || f.types.length || f.assets.length || f.wallet_id || f.account || f.date_from || f.date_to
    || f.manualOnly || f.import_id || f.value_min || f.value_max)
}

/**
 * Parámetros de la API. Con un rango de importe se envía la moneda de
 * visualización (el rango se compara en ella); sin rango, siempre USD: la
 * respuesta trae ambas monedas y cambiar EUR ↔ USD no pide nada nuevo (#177).
 */
export function toApiParams(f: HistoryFilterState, sort: SortState, offset: number, pageSize: number, currency: 'EUR' | 'USD'): Record<string, string> {
  const ranged = !!(f.value_min || f.value_max)
  return {
    limit: String(pageSize),
    offset: String(offset),
    ...(f.search ? { search: f.search } : {}),
    ...(f.types.length ? { type: f.types.join(',') } : {}),
    ...(f.assets.length ? { asset: f.assets.join(',') } : {}),
    ...(f.wallet_id ? { wallet_id: f.wallet_id } : {}),
    ...(f.account ? { account: f.account } : {}),
    ...(f.date_from ? { date_from: f.date_from } : {}),
    ...(f.date_to ? { date_to: f.date_to } : {}),
    ...(f.manualOnly ? { manually_added: 'true' } : {}),
    ...(f.import_id ? { import_id: f.import_id } : {}),
    ...(f.value_min ? { value_min: f.value_min } : {}),
    ...(f.value_max ? { value_max: f.value_max } : {}),
    sort: sort.key,
    dir: sort.dir,
    currency: ranged ? currency : 'USD',
  }
}
