import { Fragment, useState, useMemo, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi, Transaction } from '../api/portfolio'
import {
  Search, ChevronLeft, ChevronRight, X, RefreshCw,
  Download, PenLine, Calendar,
  ArrowUpDown, ArrowUp, ArrowDown, Package,
} from 'lucide-react'
import { useToast } from '../components/Toast'
import { ManualTxModal } from '../components/ManualTxModal'
import { DateRangePicker } from '../components/DateRangePicker'
import { formatEur } from '../utils/format'
import { invalidateTransactionQueries } from '../utils/queryInvalidation'
import { useWalletsQuery } from '../hooks/useWallets'
import { OP_META } from '../constants/operations'
import { buildHistoryCsv } from './history/buildHistoryCsv'
import { fmtDateGroup, calcEurValue } from './history/helpers'
import { TxRow } from './history/TxRow'
import { StatsBar } from './history/StatsBar'
import { AnalyticsPanel } from './history/AnalyticsPanel'

type SortKey = 'fecha' | 'eur' | 'activo'
type SortDir = 'asc' | 'desc'

const PAGE_SIZE = 50

// ── SortIcon ─────────────────────────────────────────────────────────────
function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown size={10} className="text-gray-700 ml-1" />
  return sortDir === 'asc'
    ? <ArrowUp size={10} className="text-accent-blue ml-1" />
    : <ArrowDown size={10} className="text-accent-blue ml-1" />
}

// ── Filtros ────────────────────────────────────────────────────────────────
interface Filters {
  asset: string; account: string; type: string; wallet_id: string
  manualOnly: boolean; date_from: string; date_to: string; search: string; offset: number
}
const INITIAL: Filters = {
  asset: '', account: '', type: '', wallet_id: '',
  manualOnly: false, date_from: '', date_to: '', search: '', offset: 0,
}

// ── Página principal ───────────────────────────────────────────────────────
export function History() {
  const queryClient = useQueryClient()
  const toast       = useToast()
  const searchRef   = useRef<HTMLInputElement>(null)

  const [filters, setFilters]         = useState<Filters>(INITIAL)
  const [sortKey, setSortKey]         = useState<SortKey>('fecha')
  const [sortDir, setSortDir]         = useState<SortDir>('desc')
  const [deletingId, setDeletingId]   = useState<string | null>(null)
  const [editingTx, setEditingTx]     = useState<Transaction | null>(null)
  const [showNewTx, setShowNewTx]     = useState(false)

  const walletList = useWalletsQuery()

  const { data: stats } = useQuery({
    queryKey: ['tx-stats'],
    queryFn:  () => portfolioApi.getTransactionStats(),
    staleTime: 5 * 60_000,
  })

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
  }), [filters])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['transactions', queryParams],
    queryFn:  () => portfolioApi.getTransactions(queryParams),
    placeholderData: prev => prev,
  })

  // Envuelto en su propio useMemo: `data?.transactions ?? []` crea un array
  // nuevo en cada render donde `data.transactions` es undefined, lo que
  // invalidaría la memoización de `transactions` de abajo en cada render en
  // vez de solo cuando cambian los datos reales.
  const rawTransactions = useMemo(() => data?.transactions ?? [], [data])
  const total      = data?.total ?? 0
  const totalEur   = data?.total_eur ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(filters.offset / PAGE_SIZE)

  // Ordenación cliente sobre la página actual
  const transactions = useMemo(() => {
    const arr = [...rawTransactions]
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortKey === 'fecha') {
      arr.sort((a, b) => dir * (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()))
    } else if (sortKey === 'eur') {
      arr.sort((a, b) => dir * ((calcEurValue(a) ?? 0) - (calcEurValue(b) ?? 0)))
    } else if (sortKey === 'activo') {
      arr.sort((a, b) => dir * a.asset.localeCompare(b.asset))
    }
    return arr
  }, [rawTransactions, sortKey, sortDir])

  const grouped = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    for (const tx of transactions) {
      const day = tx.timestamp.slice(0, 10)
      if (!map.has(day)) map.set(day, [])
      map.get(day)!.push(tx)
    }
    return [...map.entries()]
  }, [transactions])

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters(prev => ({ ...prev, [key]: value, ...(key !== 'offset' ? { offset: 0 } : {}) }))
  }
  function clearFilters() { setFilters(INITIAL); setSortKey('fecha'); setSortDir('desc') }

  function toggleSort(col: SortKey) {
    if (sortKey === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(col); setSortDir('desc') }
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

  function exportCsv() {
    const rows = buildHistoryCsv(transactions)
    const blob = new Blob(['﻿' + rows], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `historial_${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const hasActiveFilters = !!(filters.asset || filters.account || filters.type || filters.wallet_id ||
    filters.manualOnly || filters.date_from || filters.date_to || filters.search)

  const KNOWN_ACCOUNTS = ['Spot', 'Funding', 'Cross Margin', 'Isolated Margin', 'Futures', 'Manual']

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Cabecera ── */}
      <div className="shrink-0 px-6 pt-6 pb-4 space-y-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Historial</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {total > 0
                ? `${total.toLocaleString('es-ES')} transacciones${hasActiveFilters ? ' filtradas' : ''}`
                : 'Sin transacciones importadas'}
              {hasActiveFilters && totalEur > 0 && (
                <span className="ml-2 text-accent-blue font-semibold mono">· {formatEur(totalEur)} total</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button type="button" onClick={clearFilters}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white px-3 py-1.5 border border-border rounded-lg hover:border-gray-500 transition-colors">
                <X size={11} /> Limpiar
              </button>
            )}
            <button type="button" onClick={exportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-background-tertiary border border-border rounded-lg text-xs text-gray-400 hover:text-white hover:border-gray-500 transition-colors">
              <Download size={13} /> CSV
            </button>
            <button type="button" onClick={() => setShowNewTx(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-blue/15 border border-accent-blue/30 rounded-lg text-xs text-accent-blue hover:bg-accent-blue/25 transition-colors font-medium">
              + Nueva
            </button>
          </div>
        </div>

        {/* ── Filtros ── */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Búsqueda */}
          <div className="relative">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              ref={searchRef}
              placeholder="Buscar activo o nota…"
              value={filters.search}
              onChange={e => setFilter('search', e.target.value)}
              className="bg-background-tertiary border border-border rounded-lg pl-7 pr-8 py-1.5 text-xs placeholder-gray-600 focus:outline-none focus:border-accent-blue w-48"
            />
            {filters.search && (
              <button type="button" onClick={() => setFilter('search', '')} aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400">
                <X size={10} />
              </button>
            )}
          </div>

          {/* Tipo */}
          <select value={filters.type} onChange={e => setFilter('type', e.target.value)}
            className="bg-background-tertiary border border-border rounded-lg px-3 py-1.5 text-xs text-gray-400 focus:outline-none focus:border-accent-blue">
            <option value="">Todos los tipos</option>
            {Object.entries(OP_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          {/* Wallet */}
          <select value={filters.wallet_id} onChange={e => setFilter('wallet_id', e.target.value)}
            className="bg-background-tertiary border border-border rounded-lg px-3 py-1.5 text-xs text-gray-400 focus:outline-none focus:border-accent-blue">
            <option value="">Todas las wallets</option>
            {walletList.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>

          {/* Cuenta */}
          <select value={filters.account} onChange={e => setFilter('account', e.target.value)}
            className="bg-background-tertiary border border-border rounded-lg px-3 py-1.5 text-xs text-gray-400 focus:outline-none focus:border-accent-blue">
            <option value="">Todas las cuentas</option>
            {KNOWN_ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

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
                ? 'bg-accent-blue/10 border-accent-blue/40 text-accent-blue'
                : 'bg-background-tertiary border-border text-gray-400 hover:border-accent-blue/30'
            }`}>
            <PenLine size={11} /> Manuales
          </button>

          {isFetching && <RefreshCw size={11} className="text-gray-600 animate-spin ml-1" />}
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
            <div className="flex items-center justify-center py-20 text-gray-500 text-sm">
              <RefreshCw size={16} className="animate-spin mr-2" /> Cargando…
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Package size={28} className="text-gray-700" />
              <p className="text-gray-500 text-sm">
                {hasActiveFilters ? 'Sin resultados para estos filtros.' : 'No hay transacciones. Importa un CSV para empezar.'}
              </p>
              {hasActiveFilters && (
                <button type="button" onClick={clearFilters} className="text-xs text-accent-blue hover:underline">Limpiar filtros</button>
              )}
            </div>
          ) : (
            <div className="bg-background-card border border-border rounded-2xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] text-gray-500 uppercase tracking-wider border-b border-border bg-background-tertiary/40">
                    <th className="text-left px-4 py-2.5 font-medium">
                      <button type="button" onClick={() => toggleSort('fecha')} className="flex items-center hover:text-gray-300 transition-colors">
                        Fecha <SortIcon col="fecha" sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                    <th className="text-left px-3 py-2.5 font-medium">Tipo</th>
                    <th className="text-left px-3 py-2.5 font-medium">
                      <button type="button" onClick={() => toggleSort('activo')} className="flex items-center hover:text-gray-300 transition-colors">
                        Activo <SortIcon col="activo" sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                    <th className="text-right px-3 py-2.5 font-medium">
                      <button type="button" onClick={() => toggleSort('eur')} className="flex items-center ml-auto hover:text-gray-300 transition-colors">
                        Valor EUR <SortIcon col="eur" sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                    <th className="text-left px-3 py-2.5 font-medium">Fee</th>
                    <th className="text-left px-3 py-2.5 font-medium">Wallet</th>
                    <th className="px-3 py-2.5 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(([day, txs]) => (
                    <Fragment key={day}>
                      <tr className="bg-background-tertiary/25">
                        <td colSpan={7} className="px-4 py-1.5">
                          <div className="flex items-center gap-2">
                            <Calendar size={9} className="text-gray-600" />
                            <span className="text-[10px] text-gray-600 font-semibold capitalize">
                              {fmtDateGroup(day + 'T12:00:00')}
                            </span>
                            <span className="text-[10px] text-gray-700">
                              · {txs.length} operacion{txs.length !== 1 ? 'es' : ''}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {txs.map(tx => (
                        <TxRow
                          key={tx.id}
                          tx={tx}
                          onDelete={handleDelete}
                          onEdit={setEditingTx}
                          isDeleting={deletingId === tx.id}
                          searchTerm={filters.search}
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
          <span className="text-xs text-gray-600">
            {filters.offset + 1}–{Math.min(filters.offset + PAGE_SIZE, total)} de {total.toLocaleString('es-ES')}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFilter('offset', Math.max(0, filters.offset - PAGE_SIZE))}
              disabled={filters.offset === 0}
              aria-label="Página anterior"
              className="p-1.5 rounded-lg bg-background-tertiary border border-border hover:bg-border disabled:opacity-40 transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-gray-500 px-2 mono">{currentPage + 1} / {totalPages}</span>
            <button
              type="button"
              onClick={() => setFilter('offset', filters.offset + PAGE_SIZE)}
              disabled={filters.offset + PAGE_SIZE >= total}
              aria-label="Página siguiente"
              className="p-1.5 rounded-lg bg-background-tertiary border border-border hover:bg-border disabled:opacity-40 transition-colors">
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
