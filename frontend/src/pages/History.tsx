import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { portfolioApi, Transaction } from '../api/portfolio'
import { Search, Filter, ChevronLeft, ChevronRight, X, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownLeft, Coins, RefreshCw } from 'lucide-react'

// ── Configuración visual por cuenta Binance ────────────────────────────────
const ACCOUNT_META: Record<string, { color: string; label: string }> = {
  'Spot':           { color: '#6366f1', label: 'Spot' },
  'Funding':        { color: '#8b5cf6', label: 'Funding' },
  'Cross Margin':   { color: '#f59e0b', label: 'Cross Margin' },
  'Isolated Margin':{ color: '#e74c3c', label: 'Isolated Margin' },
  'Futures':        { color: '#e74c3c', label: 'Futures' },
}

// ── Configuración visual por tipo de operación ─────────────────────────────
const OP_META: Record<string, { label: string; color: string; icon: string }> = {
  BUY:              { label: 'Compra',        color: '#00c896', icon: '↓' },
  BUY_FIAT:         { label: 'Compra EUR',    color: '#00c896', icon: '↓' },
  BUY_CRYPTO:       { label: 'Compra cripto', color: '#00c896', icon: '↓' },
  SELL:             { label: 'Venta',         color: '#e74c3c', icon: '↑' },
  SELL_FIAT:        { label: 'Venta EUR',     color: '#e74c3c', icon: '↑' },
  SELL_CRYPTO:      { label: 'Venta cripto',  color: '#e74c3c', icon: '↑' },
  DEPOSIT_FIAT:     { label: 'Depósito',      color: '#6366f1', icon: '→' },
  WITHDRAW:         { label: 'Retirada',      color: '#f59e0b', icon: '←' },
  STAKING_REWARD:   { label: 'Staking',       color: '#8b5cf6', icon: '+' },
  MINING_REWARD:    { label: 'Mining',        color: '#8b5cf6', icon: '+' },
  LENDING_INTEREST: { label: 'Lending',       color: '#8b5cf6', icon: '+' },
  CASHBACK:         { label: 'Cashback',      color: '#8b5cf6', icon: '+' },
  AIRDROP:          { label: 'Airdrop',       color: '#8b5cf6', icon: '+' },
  FORK:             { label: 'Fork',          color: '#8b5cf6', icon: '+' },
  TRANSFER_INTERNAL:{ label: 'Transferencia', color: '#6b7280', icon: '⇄' },
  GIFT_SENT:        { label: 'Regalo',        color: '#e74c3c', icon: '↑' },
  LOST:             { label: 'Pérdida',       color: '#e74c3c', icon: '✕' },
  IGNORED:          { label: 'Ignorada',      color: '#374151', icon: '—' },
}

const KNOWN_ACCOUNTS = ['Spot', 'Funding', 'Cross Margin', 'Isolated Margin', 'Futures']
const PAGE_SIZE = 50

function fmtAmount(n: string | null, decimals = 6): string {
  if (!n) return '—'
  const v = parseFloat(n)
  if (Math.abs(v) >= 1000) return v.toLocaleString('es-ES', { maximumFractionDigits: 2 })
  if (Math.abs(v) >= 1) return v.toFixed(4)
  return v.toFixed(decimals)
}

function fmtDate(ts: string): string {
  return new Date(ts).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Chips ──────────────────────────────────────────────────────────────────
function AccountChip({ account }: { account: string | null }) {
  if (!account) return null
  const meta = ACCOUNT_META[account] ?? { color: '#6b7280', label: account }
  return (
    <span
      className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-md font-medium shrink-0"
      style={{ backgroundColor: `${meta.color}18`, color: meta.color }}
    >
      {meta.label}
    </span>
  )
}

function OpChip({ type }: { type: string }) {
  const meta = OP_META[type] ?? { label: type, color: '#6b7280', icon: '?' }
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md font-medium shrink-0"
      style={{ backgroundColor: `${meta.color}18`, color: meta.color }}
    >
      {meta.label}
    </span>
  )
}

// ── Filtros ────────────────────────────────────────────────────────────────
interface Filters {
  asset: string
  account: string
  type: string
  offset: number
}

const INITIAL: Filters = { asset: '', account: '', type: '', offset: 0 }

export function History() {
  const [filters, setFilters] = useState<Filters>(INITIAL)
  const [search, setSearch] = useState('')

  const queryParams = {
    limit: String(PAGE_SIZE),
    offset: String(filters.offset),
    ...(filters.asset   ? { asset: filters.asset.toUpperCase() } : {}),
    ...(filters.account ? { account: filters.account }           : {}),
    ...(filters.type    ? { type: filters.type }                 : {}),
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['transactions', queryParams],
    queryFn: () => portfolioApi.getTransactions(queryParams),
    placeholderData: prev => prev,
  })

  const transactions: Transaction[] = data?.transactions ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(filters.offset / PAGE_SIZE)

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters(prev => ({ ...prev, [key]: value, offset: key === 'offset' ? value as number : 0 }))
  }

  function clearFilters() {
    setFilters(INITIAL)
    setSearch('')
  }

  const hasActiveFilters = filters.asset || filters.account || filters.type

  return (
    <div className="flex flex-col h-full">
      {/* ── Cabecera ── */}
      <div className="shrink-0 px-6 pt-6 pb-4 border-b border-border space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Historial</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {total > 0 ? `${total.toLocaleString('es-ES')} transacciones` : 'Sin transacciones importadas'}
            </p>
          </div>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white transition-colors">
              <X size={12} />
              Limpiar filtros
            </button>
          )}
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Buscador de activo */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              placeholder="Activo..."
              value={filters.asset}
              onChange={e => setFilter('asset', e.target.value)}
              className="bg-background-tertiary border border-border rounded-lg pl-7 pr-3 py-1.5 text-xs mono placeholder-gray-600 focus:outline-none focus:border-accent-blue w-28 uppercase"
            />
          </div>

          {/* Cuenta Binance */}
          <select
            value={filters.account}
            onChange={e => setFilter('account', e.target.value)}
            className="bg-background-tertiary border border-border rounded-lg px-3 py-1.5 text-xs text-gray-400 focus:outline-none focus:border-accent-blue"
          >
            <option value="">Todas las cuentas</option>
            {KNOWN_ACCOUNTS.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          {/* Tipo de operación */}
          <select
            value={filters.type}
            onChange={e => setFilter('type', e.target.value)}
            className="bg-background-tertiary border border-border rounded-lg px-3 py-1.5 text-xs text-gray-400 focus:outline-none focus:border-accent-blue"
          >
            <option value="">Todos los tipos</option>
            {Object.entries(OP_META).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          {isFetching && <RefreshCw size={13} className="text-gray-600 animate-spin" />}
        </div>
      </div>

      {/* ── Tabla ── */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Cargando...
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
            <Filter size={24} className="text-gray-700" />
            <p className="text-gray-500 text-sm">
              {hasActiveFilters ? 'Sin resultados para estos filtros' : 'No hay transacciones. Importa un CSV para empezar.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background-primary z-10">
              <tr className="text-xs text-gray-600 uppercase tracking-wider border-b border-border">
                <th className="text-left px-4 py-2.5">Fecha</th>
                <th className="text-left px-3 py-2.5">Cuenta</th>
                <th className="text-left px-3 py-2.5">Tipo</th>
                <th className="text-left px-3 py-2.5">Activo</th>
                <th className="text-right px-3 py-2.5">Importe</th>
                <th className="text-left px-3 py-2.5">Contrapartida</th>
                <th className="text-left px-3 py-2.5">Comisión</th>
                <th className="text-left px-3 py-2.5">Wallet</th>
                <th className="text-left px-3 py-2.5 hidden xl:table-cell">Notas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {transactions.map(tx => {
                const op = OP_META[tx.operation_type]
                const isBuy  = tx.operation_type.includes('BUY')
                const isSell = tx.operation_type.includes('SELL') || tx.operation_type === 'WITHDRAW' || tx.operation_type === 'GIFT_SENT' || tx.operation_type === 'LOST'

                return (
                  <tr key={tx.id} className="hover:bg-background-tertiary/30 transition-colors group">
                    <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                      {fmtDate(tx.timestamp)}
                    </td>
                    <td className="px-3 py-2.5">
                      <AccountChip account={tx.account} />
                    </td>
                    <td className="px-3 py-2.5">
                      <OpChip type={tx.operation_type} />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-bold mono text-sm">{tx.asset}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`mono text-sm font-medium ${
                        isBuy ? 'text-accent-green' : isSell ? 'text-accent-red' : 'text-gray-300'
                      }`}>
                        {isSell ? '−' : '+'}{fmtAmount(tx.amount_net)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 mono">
                      {tx.cost_asset && tx.cost_amount
                        ? `${fmtAmount(tx.cost_amount, 2)} ${tx.cost_asset}`
                        : '—'
                      }
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-600 mono">
                      {tx.fee_asset && tx.fee_amount
                        ? `${fmtAmount(tx.fee_amount, 6)} ${tx.fee_asset}`
                        : '—'
                      }
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-md"
                        style={{ backgroundColor: `${tx.wallet_color}18`, color: tx.wallet_color }}
                      >
                        {tx.wallet_name}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-600 hidden xl:table-cell max-w-xs truncate">
                      {tx.notes ?? ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Paginación ── */}
      {total > PAGE_SIZE && (
        <div className="shrink-0 border-t border-border px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-gray-600">
            {filters.offset + 1}–{Math.min(filters.offset + PAGE_SIZE, total)} de {total.toLocaleString('es-ES')}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFilter('offset', Math.max(0, filters.offset - PAGE_SIZE))}
              disabled={filters.offset === 0}
              className="p-1.5 rounded-lg bg-background-tertiary border border-border hover:bg-border disabled:opacity-40 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-gray-500 px-2">
              {currentPage + 1} / {totalPages}
            </span>
            <button
              onClick={() => setFilter('offset', filters.offset + PAGE_SIZE)}
              disabled={filters.offset + PAGE_SIZE >= total}
              className="p-1.5 rounded-lg bg-background-tertiary border border-border hover:bg-border disabled:opacity-40 transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
