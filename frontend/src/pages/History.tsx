import { useState, useRef, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Package } from 'lucide-react'
import { portfolioApi, type Transaction } from '../api/portfolio'
import { ManualTxModal } from '../components/ManualTxModal'
import { useCurrency } from '../hooks/useDisplayCurrency'
import { statsParams } from './history/stats/statsChart'
import { useWalletsQuery } from '../hooks/useWallets'
import { exportCsvUrl } from './history/sorting'
import { activeChips } from './history/filterChips'
import { ActiveFilterChips } from './history/ActiveFilterChips'
import { useToast } from '../hooks/useToast'
import { HistorySavedViews } from './history/HistorySavedViews'
import { resultAnnouncement } from './history/announce'
import { PAGE_SIZE, useHistoryFilters } from './history/useHistoryFilters'
import { useHistoryData } from './history/useHistoryData'
import { HistoryToolbar } from './history/HistoryToolbar'
import { HistoryTable } from './history/HistoryTable'
import { HistoryPagination, PAGINATION_ID } from './history/HistoryPagination'
import { StatsBar } from './history/StatsBar'
import { AnalyticsPanel } from './history/AnalyticsPanel'
import { Button, EmptyState, LoadingState } from '../components/ui'
import { HistoryHeader } from './history/HistoryHeader'
import { TransactionDetailPanel } from './history/detail/TransactionDetailPanel'
import { useDetailNavigation } from './history/detail/useDetailNavigation'
import { useRunningBalance } from './history/balance/useRunningBalance'
import { ShortfallBanner } from './history/balance/ShortfallBanner'

// Pestaña Historial: orquesta el estado de filtros (useHistoryFilters), los
// datos (useHistoryData) y los bloques de UI de pages/history/ (#351).
export function History() {
  const searchRef = useRef<HTMLInputElement>(null)
  const paginationRef = useRef<HTMLElement>(null)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [showNewTx, setShowNewTx] = useState(false)

  const f = useHistoryFilters()
  const d = useHistoryData(f.queryParams, f.offset, f.filters.import_id)
  const toast = useToast()
  const wallets = useWalletsQuery()
  const currency = useCurrency()
  // Estadísticas sobre lo filtrado (#376), en paralelo con la lista; conservan
  // las cifras previas mientras recalculan. Traen ambas monedas.
  const statsQueryParams = useMemo(() => statsParams(f.queryParams), [f.queryParams])
  const { data: stats } = useQuery({
    queryKey: ['transactions', 'estadisticas', statsQueryParams],
    queryFn: () => portfolioApi.getHistoryStats(statsQueryParams),
    placeholderData: prev => prev,
  })

  const { total } = d
  // Panel de detalle (#373): ?tx=<id>, con Anterior/Siguiente en el orden de la lista.
  const ids = useMemo(() => d.transactions.map(t => t.id), [d.transactions])
  const nav = useDetailNavigation({
    ids, current: f.focusTx, offset: f.offset, total, open: f.openTx, setOffset: f.setOffset, pageIds: d.pageIds,
  })
  const { openTx } = f
  // Saldo corrido con un único activo filtrado (#380).
  const balance = useRunningBalance(f.filters, ids)
  const closeDetail = useCallback(() => openTx(null), [openTx])
  // Entradas y salidas de valor de lo filtrado, en la moneda de visualización (#346).
  const flows = d.data?.flows[currency] ?? null
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const announcement = resultAnnouncement({
    loading: !d.data || d.isFetching, total, filtered: f.hasActiveFilters,
    page: f.page, totalPages, sort: f.sort,
  })
  // Clic en un activo de la analítica → lo filtra (#366: filtro de activo, no búsqueda).
  const { setFilter } = f
  const handleAssetClick = useCallback((asset: string) => {
    setFilter('assets', [asset])
    searchRef.current?.focus()
  }, [setFilter])

  const walletName = useCallback((id: string) => wallets.find(w => w.id === id)?.name, [wallets])
  const currencySymbol = currency === 'USD' ? '$' : '€'
  const chips = useMemo(() => activeChips(f.filters, {
    wallet: id => wallets.find(w => w.id === id)?.name,
    importFile: id => d.imports.find(i => i.id === id)?.filename,
    currencySymbol,
  }), [f.filters, wallets, d.imports, currencySymbol])

  // Copia el enlace de esta vista (#366): la URL ya refleja filtros, orden y página.
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success('Enlace copiado', 'Abre esta misma vista del Historial')
    } catch {
      toast.error('No se pudo copiar el enlace', 'El navegador no permite acceder al portapapeles')
    }
  }

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
        <HistoryHeader loaded={!!d.data} total={total} filtered={f.hasActiveFilters} flows={flows} currency={currency}
          views={<HistorySavedViews filters={f.filters} sort={f.sort} applyState={f.applyState} startedEmpty={f.startedEmpty} />}
          onExport={exportCsv} onNew={() => setShowNewTx(true)}
          currentBalance={balance?.data ? { amount: balance.data.current, asset: balance.asset, wallet: balance.walletFiltered } : null} />
        <HistoryToolbar ref={searchRef} filters={f.filters} searchInput={f.searchInput} wallets={wallets}
          accounts={d.accounts} assets={d.assets} presentTypes={d.presentTypes} imports={d.imports}
          currencySymbol={currencySymbol} isFetching={d.isFetching}
          setSearchInput={f.setSearchInput} setFilter={f.setFilter} patchFilters={f.patchFilters}
          setDateRange={f.setDateRange} onCopyLink={() => { void copyLink() }} />
        <ActiveFilterChips chips={chips} onRemove={f.patchFilters} onClearAll={f.clearFilters} />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 pt-4 pb-4 space-y-4">
          {stats && (
            <>
              <StatsBar totals={stats.totals} currency={currency} filtered={f.hasActiveFilters} />
              <AnalyticsPanel stats={stats} currency={currency} onAssetClick={handleAssetClick}
                datesFiltered={!!(f.filters.date_from || f.filters.date_to)} />
            </>
          )}
          {balance?.data && (
            <ShortfallBanner count={balance.data.shortfalls.count} asset={balance.asset} walletFiltered={balance.walletFiltered}
              onOpenFirst={balance.data.shortfalls.first_id ? () => openTx(balance.data!.shortfalls.first_id) : null} />
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
              searchTerm={f.filters.search} selectedId={f.focusTx} deletingId={d.deletingId}
              onOpen={f.openTx} onPrefetch={nav.prefetch} onDelete={id => { void d.deleteTx(id) }} onEdit={setEditingTx}
              balance={balance}
              skipLink={total > PAGE_SIZE ? { href: `#${PAGINATION_ID}`, onActivate: () => paginationRef.current?.focus() } : undefined} />
          )}
        </div>
      </div>

      <HistoryPagination ref={paginationRef} offset={f.offset} total={total} onOffset={f.setOffset} />

      {/* Oculto mientras se edita: dos diálogos con trampa de foco no se apilan. */}
      {f.focusTx && !editingTx && !showNewTx && (
        <TransactionDetailPanel id={f.focusTx} currency={currency} onClose={closeDetail} onOpen={f.openTx}
          prev={nav.prev} next={nav.next} onEdit={setEditingTx} isDeleting={d.deletingId === f.focusTx}
          onDelete={id => { void d.deleteTx(id).then(ok => { if (ok) closeDetail() }) }}
          walletName={walletName} onRestore={id => { void d.restoreTx(id) }} restoring={d.restoringId === f.focusTx} />
      )}

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
