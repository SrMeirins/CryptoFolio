import { useState } from 'react'
import { Check } from 'lucide-react'
import type { DepositReview } from './types'
import { HistoricalPriceButton } from './HistoricalPriceButton'
import { DepositRow } from './DepositRow'

// Grupo de depósitos por activo
export function DepositAssetGroup({ asset, deposits, depositCosts, onSetCost }: {
  asset: string
  deposits: DepositReview[]
  depositCosts: Record<string, number | null>
  onSetCost: (txKey: string, price: number | null) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const reviewedCount = deposits.filter(d => d.txKey in depositCosts).length
  const allReviewed   = reviewedCount === deposits.length
  const totalAmt      = deposits.reduce((s, d) => s + d.amount, 0)
  const hasMany       = deposits.length > 1

  function applyAll(price: number | null) {
    deposits.forEach(d => onSetCost(d.txKey, price))
  }

  return (
    <div className={`rounded-xl border ${allReviewed ? 'border-accent-green/30' : 'border-border'}`}>
      <div className={`flex items-center gap-3 px-4 py-3 rounded-t-xl ${allReviewed ? 'bg-accent-green/5' : 'bg-background-tertiary/60'}`}>
        <div className={`w-2 h-2 rounded-full shrink-0 ${
          allReviewed ? 'bg-accent-green' : reviewedCount > 0 ? 'bg-accent-amber' : 'bg-gray-600'
        }`} />
        <span className="font-bold mono text-sm">{asset}</span>
        <span className="text-xs text-gray-500">
          {hasMany
            ? `${deposits.length} entradas · ${totalAmt.toLocaleString('es-ES', { maximumFractionDigits: 6 })}`
            : `${totalAmt.toLocaleString('es-ES', { maximumFractionDigits: 6 })} · ${
                new Date(deposits[0].timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
              }`
          }
        </span>
        <div className="flex-1" />

        {hasMany && (
          <div className="flex items-center gap-1.5">
            <HistoricalPriceButton asset={asset} timestamp={deposits[0].timestamp} onPrice={applyAll} label="Mercado (est.) a todos" />
            <button
              type="button"
              onClick={() => applyAll(0)}
              className="text-[10px] px-2 py-1 rounded-md border border-border text-gray-500 hover:text-white hover:border-gray-500 bg-background-card transition-colors"
            >
              Gratis a todos
            </button>
            <button
              type="button"
              onClick={() => applyAll(null)}
              className="text-[10px] px-2 py-1 rounded-md border border-border text-gray-500 hover:text-white hover:border-gray-500 bg-background-card transition-colors"
            >
              No sé a todos
            </button>
          </div>
        )}

        {hasMany && (
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            className="text-gray-500 hover:text-gray-300 transition-colors ml-1"
          >
            <span className={`text-gray-500 text-xs transition-transform inline-block ${expanded ? 'rotate-90' : ''}`}>▶</span>
          </button>
        )}

        {allReviewed && (
          <span className="text-[10px] text-accent-green flex items-center gap-0.5">
            <Check size={9} /> listo
          </span>
        )}
      </div>

      {expanded && (
        <div className="divide-y divide-border/50">
          {deposits.map(dep => (
            <DepositRow
              key={dep.txKey}
              dep={dep}
              cost={depositCosts[dep.txKey]}
              reviewed={dep.txKey in depositCosts}
              onSetCost={onSetCost}
            />
          ))}
        </div>
      )}
    </div>
  )
}
