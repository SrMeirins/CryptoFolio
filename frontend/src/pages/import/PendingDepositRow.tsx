import { Check } from 'lucide-react'
import type { PendingDeposit } from './PendingDepositsPanel'

export function PendingDepositRow({ dep, cost, isReviewed, onChangeCost, onUseHistorical, onToggleUnknown }: {
  dep: PendingDeposit
  cost: number | null | undefined
  isReviewed: boolean
  onChangeCost: (value: number | null) => void
  onUseHistorical: () => void
  onToggleUnknown: () => void
}) {
  const date   = new Date(dep.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
  const amount = parseFloat(dep.amount)

  return (
    <div
      className={`p-3 rounded-xl border transition-colors ${
        isReviewed
          ? cost != null
            ? 'border-accent-green/30 bg-accent-green/5'
            : 'border-gray-600 bg-background-tertiary'
          : 'border-accent-amber/20 bg-background-card'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-bold mono text-sm text-white">{dep.asset}</span>
            <span className="text-xs text-gray-400 mono">{amount.toLocaleString('es-ES', { maximumFractionDigits: 6 })}</span>
            <span className="text-gray-600">·</span>
            <span className="text-xs text-gray-500">{date}</span>
            {!isReviewed && (
              <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-accent-amber/15 text-accent-amber rounded-full font-medium">
                Pendiente
              </span>
            )}
            {isReviewed && cost != null && (
              <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-accent-green/15 text-accent-green rounded-full font-medium flex items-center gap-0.5">
                <Check size={9} /> {cost.toLocaleString('es-ES', { maximumFractionDigits: 4 })} €/ud.
              </span>
            )}
            {isReviewed && cost == null && (
              <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded-full font-medium">
                Desconocido
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="number"
              step="any"
              min="0"
              placeholder="Precio EUR/unidad al adquirir..."
              value={cost != null ? cost : ''}
              onChange={e => onChangeCost(e.target.value ? parseFloat(e.target.value) : null)}
              className="flex-1 bg-background-primary border border-border rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent-blue transition-colors mono"
            />
            {dep.historicalPrice != null && (
              <button
                type="button"
                onClick={onUseHistorical}
                title="Precio de mercado en esa fecha — puede no coincidir con lo que pagaste realmente. Corrígelo si sabes tu coste real."
                className="text-xs px-3 py-1.5 bg-accent-blue/10 hover:bg-accent-blue/20 border border-accent-blue/30 text-accent-blue rounded-lg transition-colors whitespace-nowrap"
              >
                {dep.historicalPrice.toLocaleString('es-ES', { maximumFractionDigits: 4 })} € (mercado, estimación)
              </button>
            )}
            <button
              type="button"
              onClick={onToggleUnknown}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
                isReviewed && cost == null
                  ? 'bg-gray-700 border-gray-600 text-gray-300'
                  : 'bg-background-primary border-border text-gray-500 hover:border-gray-500 hover:text-gray-300'
              }`}
            >
              No sé
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
