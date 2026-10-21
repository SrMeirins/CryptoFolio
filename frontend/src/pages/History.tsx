import { Fragment, useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi, Transaction } from '../api/portfolio'
import {
  Search, ChevronLeft, ChevronRight, X, RefreshCw,
  Download, PenLine, Calendar, Package, FileText,
} from 'lucide-react'
import { useToast } from '../hooks/useToast'
import { ManualTxModal } from '../components/ManualTxModal'
import { DateRangePicker } from '../components/DateRangePicker'
import { formatMoney, formatNumber } from '../utils/format'
import { useCurrency } from '../hooks/useDisplayCurrency'
import { useCurrencyQuery } from '../hooks/useCurrencyQuery'
import { txStatsQuery } from '../queries/currencyQueries'
import { invalidateTransactionQueries } from '../utils/queryInvalidation'
import { useWalletsQuery } from '../hooks/useWallets'
import { OP_META } from '../constants/operations'
import { fmtDateGroup, localDayKey } from './history/helpers'
import { DEFAULT_SORT, exportCsvUrl, groupsByDay, nextSort, type SortKey, type SortState } from './history/sorting'
import { SortHeader } from './history/SortHeader'
import { TxRow } from './history/TxRow'
import { StatsBar } from './history/StatsBar'
import { AnalyticsPanel } from './history/AnalyticsPanel'
import { cardClasses, buttonClasses, iconButtonClasses, fieldClasses, tableHeadRowClasses, Button, EmptyState, LoadingState, PageHeader, Dropdown } from '../components/ui'
import { navIcon } from '../constants/navigation'

const PAGE_SIZE = 50

// ── Filtros ────────────────────────────────────────────────────────────────
interface Filters {
  asset: string; account: string; type: string; wallet_id: string
  manualOnly: boolean; date_from: string; date_to: string; search: string; offset: number
  /** Transacciones de una importación (#324), desde su resultado o la lista de importaciones. */
  import_id: string
}
const INITIAL: Filters = {
  asset: '', account: '', type: '', wallet_id: '',
  manualOnly: false, date_from: '', date_to: '', search: '', offset: 0, import_id: '',
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── Página principal ───────────────────────────────────────────────────────
export function History() {
  const queryClient = useQueryClient()
  const toast       = useToast()
  const searchRef   = useRef<HTMLInputElement>(null)

  // ?buscar=XRP&tx=<id> llega desde la actividad reciente del Dashboard (#237).
  const [params, setParams] = useSearchParams()
  const focusTx = params.get('tx')
  const [filters, setFilters]         = useState<Filters>(() => {
    const imp = params.get('import') ?? ''
    return { ...INITIAL, search: params.get('buscar') ?? '', import_id: UUID_RE.test(imp) ? imp : '' }
  })
  // Orden en el servidor (#349): abarca todas las páginas, no solo la visible.
  const [sort, setSort]               = useState<SortState>(DEFAULT_SORT)
  const [deletingId, setDeletingId]   = useState<string | null>(null)
  const [editingTx, setEditingTx]     = useState<Transaction | null>(null)
  const [showNewTx, setShowNewTx]     = useState(false)

  const walletList = useWalletsQuery()

  const currency = useCurrency()
  // Estadísticas en la moneda de visualización; la otra se precarga (#177).
  const { data: stats } = useCurrencyQuery(txStatsQuery)

  const queryParams = useMemo(() => ({
    limit:  String(PAGE_SIZE),
    offset: String(filters.offset),
    ...(filters.asset      ? { asset:         filters.asset.toUpperCase() } : {}),
    ...(filters.account    ? { account:        filters.account }            : {}),
    ...(filters.type       ? { type:           filters.type }               : {}),
    ...(filters.wallet_id  ? { wallet_id:      filters.wallet_id }          : {}),
    ...(filters.date_from  ? { date_from:      filters.date_from }          : {}),
    ...(filters.date_to    ? { date_to:        filters.date_to }            : {}),
    ...(filters.search     ? { search:         filters.search }             : {}),
    ...(filters.manualOnly ? { manually_added: 'true' }                     : {}),
    ...(filters.import_id  ? { import_id:      filters.import_id }          : {}),
    sort: sort.key,
    dir:  sort.dir,
  }), [filters, sort])

  // Nombre del archivo de la importación filtrada, para la etiqueta.
  const { data: imports = [] } = useQuery({ queryKey: ['imports'], queryFn: portfolioApi.getImports, enabled: !!filters.import_id })
  const importFiltrada = imports.find(i => i.id === filters.import_id)
  function quitarImport() {
    setFilters(prev => ({ ...prev, import_id: '', offset: 0 }))
    if (params.has('import')) { const p = new URLSearchParams(params); p.delete('import'); setParams(p, { replace: true }) }
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['transactions', queryParams],
    // Siempre en USD: la respuesta trae el total en ambas monedas y el tipo
    // de cada fila, así que el cambio EUR ↔ USD no necesita otra petición (#177).
    queryFn:  () => portfolioApi.getTransactions(queryParams, 'USD'),
    placeholderData: prev => prev,
  })

  // Envuelto en su propio useMemo: `data?.transactions ?? []` crea un array
  // nuevo en cada render donde `data.transactions` es undefined, lo que
  // invalidaría la memoización de `transactions` de abajo en cada render en
  // vez de solo cuando cambian los datos reales.
  const rawTransactions = useMemo(() => data?.transactions ?? [], [data])
  const total      = data?.total ?? 0
  // Entradas y salidas de valor de lo filtrado, en la moneda de visualización (#346).
  const flows = data?.flows[currency] ?? null
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(filters.offset / PAGE_SIZE)

  // Precarga de la página siguiente con los mismos filtros y orden: pasar de
  // página es inmediato.
  useEffect(() => {
    if (!data || filters.offset + PAGE_SIZE >= data.total) return
    const next = { ...queryParams, offset: String(filters.offset + PAGE_SIZE) }
    void queryClient.prefetchQuery({
      queryKey: ['transactions', next],
      queryFn:  () => portfolioApi.getTransactions(next, 'USD'),
    })
  }, [data, queryParams, filters.offset, queryClient])

  const transactions = rawTransactions
  // Cabeceras por día solo ordenando por fecha; con otro orden, lista plana
  // (un único grupo sin cabecera).
  const byDay = groupsByDay(sort)
  const grouped = useMemo(() => {
    if (!byDay) return [['', transactions] as [string, Transaction[]]]
    const map = new Map<string, Transaction[]>()
    for (const tx of transactions) {
      // Día local, el mismo de la hora que muestra la fila (no el día UTC).
      const day = localDayKey(tx.timestamp)
      if (!map.has(day)) map.set(day, [])
      map.get(day)!.push(tx)
    }
    return [...map.entries()]
  }, [transactions, byDay])

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters(prev => ({ ...prev, [key]: value, ...(key !== 'offset' ? { offset: 0 } : {}) }))
  }
  function clearFilters() { quitarImport(); setFilters(INITIAL); setSort(DEFAULT_SORT) }

  function toggleSort(col: SortKey) {
    setSort(s => nextSort(s, col))
    setFilters(prev => ({ ...prev, offset: 0 }))
  }

  // Click en top activos → aplica buscador
  const handleAssetClick = useCallback((asset: string) => {
    setFilters(prev => ({ ...prev, search: asset, offset: 0 }))
    searchRef.current?.focus()
  }, [])

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const result = await portfolioApi.deleteManualTx(id)
      invalidateTransactionQueries(queryClient)
      if (result.fifoError) {
        toast.warning('Transacción eliminada', `Eliminada, pero el recálculo FIFO falló: ${result.fifoError}`)
      } else {
        toast.success('Transacción eliminada', 'FIFO recalculado')
      }
    } catch (e) {
      toast.error('Error al eliminar', (e as Error).message)
    } finally {
      setDeletingId(null)
    }
  }

  function handleModalSuccess() {
    invalidateTransactionQueries(queryClient)
    setEditingTx(null); setShowNewTx(false)
  }

  // Todo lo filtrado, en el orden elegido, lo genera el backend en streaming (#349).
  function exportCsv() {
    const a = document.createElement('a')
    a.href = exportCsvUrl(queryParams)
    a.download = ''
    a.click()
  }


  const hasActiveFilters = !!(filters.asset || filters.account || filters.type || filters.wallet_id ||
    filters.manualOnly || filters.date_from || filters.date_to || filters.search || filters.import_id)

  // Cuentas presentes en los datos (#346); antes una lista fija sin, p. ej., Bitvavo.
  const { data: facets } = useQuery({ queryKey: ['transactions', 'facets'], queryFn: portfolioApi.getTransactionFacets, staleTime: 60_000 })
  const accounts = facets?.accounts ?? []

  const subtitle = !data
    ? 'Cargando…'
    : total > 0
      ? `${formatNumber(total, 0)} transacciones${hasActiveFilters ? ' filtradas' : ''}`
      : hasActiveFilters ? 'Sin resultados para estos filtros' : 'Sin transacciones importadas'

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Cabecera ── */}
      <div className="shrink-0 px-6 pt-6 pb-4 space-y-4 border-b border-border">
        <PageHeader
          icon={navIcon('/history')}
          title="Historial"
          subtitle={<>
              {subtitle}
              {hasActiveFilters && flows && (flows.entradas > 0 || flows.salidas > 0) && (
                <span className="ml-2 mono" title="Suma del valor de las operaciones de entrada y de salida; no incluye movimientos entre tus wallets">
                  {flows.entradas > 0 && <> · <span className="text-positive font-semibold">+{formatMoney(flows.entradas, currency)}</span> entradas</>}
                  {flows.salidas > 0 && <> · <span className="text-negative font-semibold">−{formatMoney(flows.salidas, currency)}</span> salidas</>}
                </span>
              )}
            </>}
          actions={<>
            {hasActiveFilters && (
              <button type="button" onClick={clearFilters}
                className="flex items-center gap-1.5 text-xs text-fg-subtle hover:text-fg px-3 py-1.5 border border-border rounded-lg hover:border-fg-subtle transition-colors">
                <X size={11} /> Limpiar
              </button>
            )}
            <button type="button" onClick={exportCsv} disabled={total === 0}
              title={total > 0 ? `Exporta las ${formatNumber(total, 0)} transacciones${hasActiveFilters ? ' filtradas' : ''}` : 'No hay transacciones que exportar'}
              aria-label={`Exportar a CSV ${formatNumber(total, 0)} transacciones`}
              className={buttonClasses('secondary', 'sm', 'flex gap-1.5')}>
              <Download size={13} aria-hidden="true" /> CSV{total > 0 && <span className="mono text-fg-subtle">({formatNumber(total, 0)})</span>}
            </button>
            <button type="button" onClick={() => setShowNewTx(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand/15 border border-brand/30 rounded-lg text-xs text-brand hover:bg-brand/25 transition-colors font-medium">
              + Nueva
            </button>
</>}
        />

        {filters.import_id && (
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/8 px-2.5 py-1 text-brand">
              <FileText size={12} aria-hidden="true" />
              De la importación <span className="font-medium">{importFiltrada?.filename ?? '…'}</span>
              <button type="button" onClick={quitarImport} aria-label="Quitar el filtro de importación"
                className="ml-0.5 rounded hover:text-fg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60"><X size={11} aria-hidden="true" /></button>
            </span>
          </div>
        )}

        {/* ── Filtros ── */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Búsqueda */}
          <div className="relative">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input
              ref={searchRef}
              placeholder="Buscar activo o nota…"
              value={filters.search}
              onChange={e => setFilter('search', e.target.value)}
              className={fieldClasses('sm', false, 'pl-7 pr-8 w-48')}
            />
            {filters.search && (
              <button type="button" onClick={() => setFilter('search', '')} aria-label="Limpiar búsqueda"
                className={iconButtonClasses('sm', false, 'absolute right-2 top-1/2 -translate-y-1/2')}>
                <X size={10} />
              </button>
            )}
          </div>

          {/* Tipo */}
          <Dropdown size="sm" label="Filtrar por tipo" value={filters.type} onChange={v => setFilter('type', v)}
            options={[{ value: '', label: 'Todos los tipos' }, ...Object.entries(OP_META).map(([k, v]) => ({ value: k, label: v.label }))]} />

          {/* Wallet */}
          <Dropdown size="sm" label="Filtrar por wallet" value={filters.wallet_id} onChange={v => setFilter('wallet_id', v)}
            options={[{ value: '', label: 'Todas las wallets' }, ...walletList.map(w => ({ value: w.id, label: w.name }))]} />

          {/* Cuenta */}
          <Dropdown size="sm" label="Filtrar por cuenta" value={filters.account} onChange={v => setFilter('account', v)}
            options={[{ value: '', label: 'Todas las cuentas' }, ...accounts.map(a => ({ value: a, label: a }))]} />

          {/* Rango de fechas */}
          <DateRangePicker
            from={filters.date_from}
            to={filters.date_to}
            onChange={(f, t) => setFilters(prev => ({ ...prev, date_from: f, date_to: t, offset: 0 }))}
          />

          {/* Solo manuales */}
          <button type="button" onClick={() => setFilter('manualOnly', !filters.manualOnly)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              filters.manualOnly
                ? 'bg-brand/10 border-brand/40 text-brand'
                : 'bg-background-tertiary border-border text-fg-muted hover:border-brand/30'
            }`}>
            <PenLine size={11} /> Manuales
          </button>

          {isFetching && <RefreshCw size={11} className="text-fg-subtle animate-spin ml-1" />}
        </div>
      </div>

      {/* ── Contenido ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 pt-4 pb-4 space-y-4">

          {!hasActiveFilters && stats && (
            <>
              <StatsBar stats={stats} />
              <AnalyticsPanel stats={stats} onAssetClick={handleAssetClick} />
            </>
          )}

          {isLoading ? (
            <LoadingState />
          ) : transactions.length === 0 ? (
            <EmptyState
              icon={<Package size={28} />}
              title={hasActiveFilters ? 'Sin resultados para estos filtros.' : 'No hay transacciones. Importa un CSV para empezar.'}
              action={hasActiveFilters && <Button variant="ghost" size="sm" onClick={clearFilters}>Limpiar filtros</Button>}
            />
          ) : (
            <div className={cardClasses('none', 'overflow-hidden')}>
              <table className="w-full">
                <thead>
                  <tr className={tableHeadRowClasses()}>
                    <SortHeader col="fecha" sort={sort} onSort={toggleSort} className="px-4 py-2.5">Fecha</SortHeader>
                    <SortHeader col="tipo" sort={sort} onSort={toggleSort} className="px-3 py-2.5">Tipo</SortHeader>
                    <SortHeader col="activo" sort={sort} onSort={toggleSort} className="px-3 py-2.5">Activo</SortHeader>
                    <SortHeader col="valor" sort={sort} onSort={toggleSort} align="right" className="px-3 py-2.5">Valor {currency}</SortHeader>
                    <th className="text-left px-3 py-2.5 font-medium">Fee</th>
                    <th className="text-left px-3 py-2.5 font-medium">Wallet</th>
                    <th className="px-3 py-2.5 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(([day, txs]) => (
                    <Fragment key={day || 'todas'}>
                      {byDay && <tr className="bg-background-tertiary/25">
                        <td colSpan={7} className="px-4 py-1.5">
                          <div className="flex items-center gap-2">
                            <Calendar size={9} className="text-fg-subtle" />
                            <span className="text-xs text-fg-subtle font-semibold">
                              {fmtDateGroup(day)}
                            </span>
                            <span className="text-xs text-fg-subtle">
                              · {txs.length} {txs.length !== 1 ? 'operaciones' : 'operación'}
                            </span>
                          </div>
                        </td>
                      </tr>}
                      {txs.map(tx => (
                        <TxRow
                          key={tx.id}
                          tx={tx}
                          onDelete={handleDelete}
                          onEdit={setEditingTx}
                          isDeleting={deletingId === tx.id}
                          searchTerm={filters.search}
                          currency={currency}
                          defaultExpanded={tx.id === focusTx}
                        />
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Paginación ── */}
      {total > PAGE_SIZE && (
        <div className="shrink-0 border-t border-border px-4 py-3 flex items-center justify-between bg-background-primary">
          <span className="text-xs text-fg-subtle">
            {filters.offset + 1}–{Math.min(filters.offset + PAGE_SIZE, total)} de {formatNumber(total, 0)}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFilter('offset', Math.max(0, filters.offset - PAGE_SIZE))}
              disabled={filters.offset === 0}
              aria-label="Página anterior"
              className={buttonClasses('secondary', 'md')}>
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-fg-subtle px-2 mono">{currentPage + 1} / {totalPages}</span>
            <button
              type="button"
              onClick={() => setFilter('offset', filters.offset + PAGE_SIZE)}
              disabled={filters.offset + PAGE_SIZE >= total}
              aria-label="Página siguiente"
              className={buttonClasses('secondary', 'md')}>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {(showNewTx || editingTx) && (
        <ManualTxModal
          onClose={() => { setShowNewTx(false); setEditingTx(null) }}
          onSuccess={handleModalSuccess}
          transaction={editingTx ?? undefined}
        />
      )}
    </div>
  )
}
