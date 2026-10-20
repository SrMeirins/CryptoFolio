import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { DepositReview } from './types'
import { HistoricalPriceButton } from './HistoricalPriceButton'
import { DepositRow } from './DepositRow'
import { CryptoIcon } from '../../components/CryptoIcon'
import { formatNumber } from '../../utils/format'

// Grupo de depósitos por activo
export function DepositAssetGroup({ asset, deposits, depositCosts, onSetCost, resaltado }: {
  asset: string
  resaltado: string | null
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
  // Cada depósito con el precio de mercado de SU día (antes se aplicaba el del primero a todos).
  const conPrecio = deposits.filter(d => d.historicalPrice != null && d.historicalPrice > 0)
  function mercadoATodos() {
    conPrecio.forEach(d => onSetCost(d.txKey, d.historicalPrice as number))
  }

  return (
    <div className={`rounded-xl border ${allReviewed ? 'border-positive/30' : 'border-border'}`}>
      <div className={`flex items-center gap-3 px-4 py-3 rounded-t-xl ${allReviewed ? 'bg-positive/5' : 'bg-background-tertiary/60'}`}>
        <div className={`w-2 h-2 rounded-full shrink-0 ${
          allReviewed ? 'bg-positive' : reviewedCount > 0 ? 'bg-warning' : 'bg-fg-subtle/50'
        }`} />
        <CryptoIcon symbol={asset} size={20} />
        <span className="font-bold mono text-sm">{asset}</span>
        <span className="text-xs text-fg-subtle">
          {hasMany
            ? `${deposits.length} entradas · ${formatNumber(totalAmt, 6)}`
            : `${formatNumber(totalAmt, 6)} · ${
                new Date(deposits[0].timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
              }`
          }
        </span>
        <div className="flex-1" />

        {hasMany && (
          <div className="flex items-center gap-1.5">
            {conPrecio.length > 0
              ? <button type="button" onClick={mercadoATodos}
                  className="text-xs px-2 py-1 rounded-lg border border-border text-fg-subtle hover:text-fg hover:border-fg-subtle bg-background-card transition-colors">
                  Mercado a todos
                </button>
              : <HistoricalPriceButton asset={asset} timestamp={deposits[0].timestamp} onPrice={applyAll} label="Mercado (est.) a todos" />}
            <button
              type="button"
              onClick={() => applyAll(0)}
              className="text-xs px-2 py-1 rounded-lg border border-border text-fg-subtle hover:text-fg hover:border-fg-subtle bg-background-card transition-colors"
            >
              Gratis a todos
            </button>
            <button
              type="button"
              onClick={() => applyAll(null)}
              className="text-xs px-2 py-1 rounded-lg border border-border text-fg-subtle hover:text-fg hover:border-fg-subtle bg-background-card transition-colors"
            >
              No sé a todos
            </button>
          </div>
        )}

        {hasMany && (
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            aria-expanded={expanded}
            aria-label={expanded ? `Ocultar los depósitos de ${asset}` : `Ver los depósitos de ${asset}`}
            className="p-1 rounded-md text-fg-subtle hover:text-fg transition-colors ml-1 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        )}

        {allReviewed && (
          <span className="text-xs text-positive flex items-center gap-0.5">
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
              resaltado={resaltado}
            />
          ))}
        </div>
      )}
    </div>
  )
}
