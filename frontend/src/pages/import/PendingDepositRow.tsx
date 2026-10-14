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
            ? 'border-positive/30 bg-positive/5'
            : 'border-border bg-background-tertiary'
          : 'border-warning/20 bg-background-card'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-bold mono text-sm text-fg">{dep.asset}</span>
            <span className="text-xs text-fg-muted mono">{amount.toLocaleString('es-ES', { maximumFractionDigits: 6 })}</span>
            <span className="text-fg-subtle">·</span>
            <span className="text-xs text-fg-subtle">{date}</span>
            {!isReviewed && (
              <span className="ml-auto text-xs px-1.5 py-0.5 bg-warning/15 text-warning rounded-full font-medium">
                Pendiente
              </span>
            )}
            {isReviewed && cost != null && (
              <span className="ml-auto text-xs px-1.5 py-0.5 bg-positive/15 text-positive rounded-full font-medium flex items-center gap-0.5">
                <Check size={9} /> {cost.toLocaleString('es-ES', { maximumFractionDigits: 4 })} €/ud.
              </span>
            )}
            {isReviewed && cost == null && (
              <span className="ml-auto text-xs px-1.5 py-0.5 bg-overlay/10 text-fg-muted rounded-full font-medium">
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
              className="flex-1 bg-background-primary border border-border rounded-lg px-3 py-1.5 text-sm text-fg placeholder-fg-subtle focus:outline-hidden focus:border-brand transition-colors mono"
            />
            {dep.historicalPrice != null && (
              <button
                type="button"
                onClick={onUseHistorical}
                title="Precio de mercado en esa fecha — puede no coincidir con lo que pagaste realmente. Corrígelo si sabes tu coste real."
                className="text-xs px-3 py-1.5 bg-brand/10 hover:bg-brand/20 border border-brand/30 text-brand rounded-lg transition-colors whitespace-nowrap"
              >
                {dep.historicalPrice.toLocaleString('es-ES', { maximumFractionDigits: 4 })} € (mercado, estimación)
              </button>
            )}
            <button
              type="button"
              onClick={onToggleUnknown}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
                isReviewed && cost == null
                  ? 'bg-background-tertiary border-border text-fg'
                  : 'bg-background-primary border-border text-fg-subtle hover:border-fg-subtle hover:text-fg'
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
