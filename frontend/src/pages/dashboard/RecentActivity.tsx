import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { History } from 'lucide-react'
import { portfolioApi, type Transaction } from '../../api/portfolio'
import { formatAmount, formatMoney } from '../../utils/format'
import { OP_META, type OpGroup } from '../../constants/operations'
import { T, alpha, ink } from '../../utils/colors'
import { useCurrency } from '../../hooks/useDisplayCurrency'
import { calcEurValue, toDisplayAmount } from '../history/helpers'
import { localToday } from '../../utils/pnlChart'
import { filterActivity, groupByDay, localTimeOf, selectRecent, type ActivityFilter } from '../../utils/recentActivity'
import { activitySubtitle } from '../../utils/panelSubtitles'
import { CryptoIcon } from '../../components/CryptoIcon'
import { EmptyState, PanelHeader, SegmentedControl, Skeleton, panelSurface } from '../../components/ui'

// Actividad reciente (#237): línea de tiempo de los últimos 7 días (máx. 12
// operaciones; si no hay, las 8 últimas) agrupada por día en hora de Madrid,
// con icono del activo, tipo, cantidad, valor en la moneda de visualización,
// wallet y hora. Filtros rápidos por tipo; cada operación abre el Historial.

const FILTERS: Array<{ value: ActivityFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'buy', label: 'Compras' },
  { value: 'sell', label: 'Ventas' },
  { value: 'transfer', label: 'Movimientos' },
]

interface Item { tx: Transaction; timestamp: string; group: OpGroup }

export function RecentActivity() {
  const currency = useCurrency()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const { data, isLoading } = useQuery({
    queryKey: ['recent-transactions', currency],
    queryFn: () => portfolioApi.getTransactions({ limit: '20', offset: '0' }, currency),
    refetchInterval: 60_000,
  })

  const today = localToday()
  const items = useMemo<Item[]>(() => selectRecent(data?.transactions ?? [], today).map(tx => ({
    tx, timestamp: tx.timestamp, group: OP_META[tx.operation_type]?.group ?? 'other',
  })), [data, today])
  const groups = useMemo(() => groupByDay(filterActivity(items, filter), today), [items, filter, today])

  return (
    <div className={panelSurface('none', 'overflow-hidden')}>
      <PanelHeader
        icon={History}
        title="Actividad reciente"
        className="px-5 py-4 border-b border-border"
        subtitle={isLoading ? undefined : activitySubtitle(items.length)}
        actions={
          <>
            <SegmentedControl label="Filtrar la actividad" variant="accent" value={filter} onChange={setFilter} options={FILTERS} />
            <Link to="/history" className="text-xs text-brand hover:underline">Ver todo →</Link>
          </>
        }
      />

      {isLoading ? (
        <div className="p-5 space-y-3" role="status" aria-label="Cargando la actividad">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState compact title={items.length === 0 ? 'Sin transacciones aún' : 'Sin operaciones de este tipo en el periodo'} />
      ) : (
        <div className="px-5 py-4 space-y-4">
          {groups.map(g => (
            <section key={g.day} aria-label={g.label}>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle mb-2">{g.label}</h3>
              {/* Línea de tiempo: un punto por operación con el color de su tipo */}
              <ol className="relative ml-1.5 border-l border-border space-y-1">
                {g.items.map(({ tx, group }) => {
                  const meta = OP_META[tx.operation_type] ?? { label: tx.operation_type, color: T.muted, group: 'other' as const }
                  const value = toDisplayAmount(calcEurValue(tx), tx, currency)
                  const sign = group === 'buy' || group === 'income' ? '+' : group === 'sell' ? '−' : ''
                  const amountTone = group === 'buy' ? 'text-positive' : group === 'sell' ? 'text-negative' : group === 'income' ? 'text-accent-purple' : 'text-fg-muted'
                  return (
                    <li key={tx.id} className="relative pl-5">
                      <span aria-hidden="true" className="absolute -left-[5px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full ring-4 ring-background-card"
                        style={{ background: meta.color }} />
                      <button
                        type="button"
                        onClick={() => navigate(`/history?buscar=${encodeURIComponent(tx.asset)}&tx=${encodeURIComponent(tx.id)}`)}
                        aria-label={`${meta.label} de ${formatAmount(tx.amount, 6)} ${tx.asset}${value != null ? `, ${formatMoney(value, currency)}` : ''}, ${localTimeOf(tx.timestamp)}. Abrir en el Historial`}
                        className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-colors hover:bg-overlay/4 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        <CryptoIcon symbol={tx.asset} size={28} />
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-fg">{tx.asset}</span>
                            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-md"
                              style={{ backgroundColor: alpha(meta.color, 10), color: meta.color }}>{meta.label}</span>
                            {tx.wallet_name && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded-md"
                                style={{ backgroundColor: alpha(tx.wallet_color, 10), color: ink(tx.wallet_color) }}>{tx.wallet_name}</span>
                            )}
                          </span>
                          <span className={`block text-xs mono mt-0.5 ${amountTone}`}>{sign}{formatAmount(tx.amount, 6)} {tx.asset}</span>
                        </span>
                        <span className="text-right shrink-0">
                          <span className="block text-sm mono font-semibold text-fg">{value != null ? formatMoney(value, currency) : '—'}</span>
                          <span className="block text-[11px] mono text-fg-subtle">{localTimeOf(tx.timestamp)}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
