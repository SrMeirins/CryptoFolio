import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { portfolioApi } from '../../api/portfolio'
import { formatAmount } from '../../utils/format'
import { OP_META } from '../../constants/operations'

function relativeDate(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 1)   return 'ahora mismo'
  if (mins  < 60)  return `hace ${mins} min`
  if (hours < 24)  return `hace ${hours} h`
  if (days  < 7)   return `hace ${days} día${days > 1 ? 's' : ''}`
  return new Date(ts).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

export function RecentActivity() {
  const { data, isLoading } = useQuery({
    queryKey: ['recent-transactions'],
    queryFn: () => portfolioApi.getTransactions({ limit: '8', offset: '0' }),
    refetchInterval: 60_000,
  })

  const txs = data?.transactions ?? []

  return (
    <div className="bg-background-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold">Actividad reciente</h3>
        <Link to="/history" className="text-xs text-accent-blue hover:underline">Ver todo →</Link>
      </div>

      {isLoading ? (
        <div className="divide-y divide-border/40">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5">
              <div className="w-16 h-6 skeleton rounded-lg" />
              <div className="flex-1 h-4 skeleton rounded" />
              <div className="w-16 h-4 skeleton rounded" />
            </div>
          ))}
        </div>
      ) : txs.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-sm text-gray-600">
          Sin transacciones aún
        </div>
      ) : (
        <div className="divide-y divide-border/30">
          {txs.map(tx => {
            // Clasificación vía meta.group (constants/operations.ts), no un
            // array hardcodeado aparte: antes este fichero reimplementaba su
            // propia lista de tipos por categoría, con riesgo real de
            // desincronizarse de OP_META si se añade un tipo de operación
            // nuevo (p. ej. MARGIN_BORROW/MARGIN_REPAY, añadidos en el
            // Nivel 2 y ya ausentes de esta lista hasta ahora).
            const meta = OP_META[tx.operation_type] ?? { label: tx.operation_type, color: '#6b7280', group: 'other' as const, rowBg: 'transparent' }
            const isIncome = meta.group === 'income'
            const isSell   = meta.group === 'sell'
            const isBuy    = meta.group === 'buy'
            return (
              <div
                key={tx.id}
                className="flex items-center gap-3 px-5 py-3 transition-all hover:brightness-105"
                style={{ background: meta.rowBg }}
              >
                {/* Badge operación */}
                <span
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg shrink-0 min-w-[76px] text-center border"
                  style={{
                    backgroundColor: `${meta.color}15`,
                    color: meta.color,
                    borderColor: `${meta.color}30`,
                  }}
                >
                  {meta.label}
                </span>

                {/* Activo + wallet */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{tx.asset}</span>
                    {tx.wallet_name && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-md font-medium shrink-0"
                        style={{ backgroundColor: `${tx.wallet_color}18`, color: tx.wallet_color }}
                      >
                        {tx.wallet_name}
                      </span>
                    )}
                  </div>
                  <p className={`text-xs font-mono mt-0.5 ${
                    isBuy ? 'text-accent-green/80' : isSell ? 'text-accent-red/80' : isIncome ? 'text-violet-400/80' : 'text-gray-500'
                  }`}>
                    {isBuy ? '+' : isSell ? '−' : ''}{formatAmount(tx.amount, 6)}
                  </p>
                </div>

                {/* Fecha */}
                <span className="text-[11px] text-gray-600 shrink-0 tabular-nums">{relativeDate(tx.timestamp)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
