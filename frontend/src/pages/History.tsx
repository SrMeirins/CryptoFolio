import { useState, useRef, useCallback } from 'react'
import { Download, Package, X } from 'lucide-react'
import type { Transaction } from '../api/portfolio'
import { ManualTxModal } from '../components/ManualTxModal'
import { formatMoney, formatNumber } from '../utils/format'
import { useCurrency } from '../hooks/useDisplayCurrency'
import { useCurrencyQuery } from '../hooks/useCurrencyQuery'
import { txStatsQuery } from '../queries/currencyQueries'
import { useWalletsQuery } from '../hooks/useWallets'
import { exportCsvUrl } from './history/sorting'
import { resultAnnouncement } from './history/announce'
import { PAGE_SIZE, useHistoryFilters } from './history/useHistoryFilters'
import { useHistoryData } from './history/useHistoryData'
import { HistoryToolbar } from './history/HistoryToolbar'
import { HistoryTable } from './history/HistoryTable'
import { HistoryPagination, PAGINATION_ID } from './history/HistoryPagination'
import { StatsBar } from './history/StatsBar'
import { AnalyticsPanel } from './history/AnalyticsPanel'
import { buttonClasses, Button, EmptyState, LoadingState, PageHeader } from '../components/ui'
import { navIcon } from '../constants/navigation'

// Pestaña Historial: orquesta el estado de filtros (useHistoryFilters), los
// datos (useHistoryData) y los bloques de UI de pages/history/ (#351).
export function History() {
  const searchRef = useRef<HTMLInputElement>(null)
  const paginationRef = useRef<HTMLElement>(null)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [showNewTx, setShowNewTx] = useState(false)

  const f = useHistoryFilters()
  const d = useHistoryData(f.queryParams, f.filters.offset, f.filters.import_id)
  const wallets = useWalletsQuery()
  const currency = useCurrency()
  // Estadísticas en la moneda de visualización; la otra se precarga (#177).
  const { data: stats } = useCurrencyQuery(txStatsQuery)

  const { total } = d
  // Entradas y salidas de valor de lo filtrado, en la moneda de visualización (#346).
  const flows = d.data?.flows[currency] ?? null
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const announcement = resultAnnouncement({
    loading: !d.data || d.isFetching, total, filtered: f.hasActiveFilters,
    page: Math.floor(f.filters.offset / PAGE_SIZE) + 1, totalPages, sort: f.sort,
  })
  const subtitle = !d.data ? 'Cargando…'
    : total > 0 ? `${formatNumber(total, 0)} transacciones${f.hasActiveFilters ? ' filtradas' : ''}`
      : f.hasActiveFilters ? 'Sin resultados para estos filtros' : 'Sin transacciones importadas'

  // Clic en un activo de la analítica → lo busca.
  const { setFilter } = f
  const handleAssetClick = useCallback((asset: string) => {
    setFilter('search', asset)
    searchRef.current?.focus()
  }, [setFilter])

  // Todo lo filtrado, en el orden elegido, lo genera el backend en streaming (#349).
  function exportCsv() {
    const a = document.createElement('a')
    a.href = exportCsvUrl(f.queryParams)
    a.download = ''
    a.click()
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Anuncio de resultados para lectores de pantalla (#351). */}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>

      <div className="shrink-0 px-6 pt-6 pb-4 space-y-4 border-b border-border">
        <PageHeader
          icon={navIcon('/history')}
          title="Historial"
          subtitle={<>
            {subtitle}
            {f.hasActiveFilters && flows && (flows.entradas > 0 || flows.salidas > 0) && (
              <span className="ml-2 mono" title="Suma del valor de las operaciones de entrada y de salida; no incluye movimientos entre tus wallets">
                {flows.entradas > 0 && <> · <span className="text-positive font-semibold">+{formatMoney(flows.entradas, currency)}</span> entradas</>}
                {flows.salidas > 0 && <> · <span className="text-negative font-semibold">−{formatMoney(flows.salidas, currency)}</span> salidas</>}
              </span>
            )}
          </>}
          actions={<>
            {f.hasActiveFilters && (
              <button type="button" onClick={f.clearFilters}
                className={buttonClasses('ghost', 'sm', 'flex gap-1.5 border border-border')}>
                <X size={11} aria-hidden="true" /> Limpiar
              </button>
            )}
            <button type="button" onClick={exportCsv} disabled={total === 0}
              title={total > 0 ? `Exporta las ${formatNumber(total, 0)} transacciones${f.hasActiveFilters ? ' filtradas' : ''}` : 'No hay transacciones que exportar'}
              aria-label={`Exportar a CSV ${formatNumber(total, 0)} transacciones`}
              className={buttonClasses('secondary', 'sm', 'flex gap-1.5')}>
              <Download size={13} aria-hidden="true" /> CSV{total > 0 && <span className="mono text-fg-subtle">({formatNumber(total, 0)})</span>}
            </button>
            <button type="button" onClick={() => setShowNewTx(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand/15 border border-brand/30 rounded-lg text-xs text-brand hover:bg-brand/25 transition-colors font-medium focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
              + Nueva
            </button>
          </>}
        />
        <HistoryToolbar ref={searchRef} filters={f.filters} wallets={wallets} accounts={d.accounts}
          importFilename={d.importFilename} isFetching={d.isFetching}
          setFilter={f.setFilter} setDateRange={f.setDateRange} clearImport={f.clearImport} />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 pt-4 pb-4 space-y-4">
          {!f.hasActiveFilters && stats && (
            <>
              <StatsBar stats={stats} />
              <AnalyticsPanel stats={stats} onAssetClick={handleAssetClick} />
            </>
          )}
          {d.isLoading ? (
            <LoadingState />
          ) : d.transactions.length === 0 ? (
            <EmptyState
              icon={<Package size={28} aria-hidden="true" />}
              title={f.hasActiveFilters ? 'Sin resultados para estos filtros.' : 'No hay transacciones. Importa un CSV para empezar.'}
              action={f.hasActiveFilters && <Button variant="ghost" size="sm" onClick={f.clearFilters}>Limpiar filtros</Button>}
            />
          ) : (
            <HistoryTable transactions={d.transactions} sort={f.sort} onSort={f.toggleSort} currency={currency}
              searchTerm={f.filters.search} focusTx={f.focusTx} deletingId={d.deletingId}
              onDelete={d.deleteTx} onEdit={setEditingTx}
              skipLink={total > PAGE_SIZE ? { href: `#${PAGINATION_ID}`, onActivate: () => paginationRef.current?.focus() } : undefined} />
          )}
        </div>
      </div>

      <HistoryPagination ref={paginationRef} offset={f.filters.offset} total={total} onOffset={f.setOffset} />

      {(showNewTx || editingTx) && (
        <ManualTxModal
          onClose={() => { setShowNewTx(false); setEditingTx(null) }}
          onSuccess={() => { d.refresh(); setEditingTx(null); setShowNewTx(false) }}
          transaction={editingTx ?? undefined}
        />
      )}
    </div>
  )
}
