import { AlertTriangle } from 'lucide-react'
import { shortfallSummary } from './balanceFormat'

/**
 * Banda de huecos del activo filtrado (#380): cuántas operaciones pidieron más
 * de lo que había (en todo su historial) y acceso a la más antigua.
 */
export function ShortfallBanner({ count, asset, onOpenFirst, walletFiltered }: {
  count: number
  asset: string
  onOpenFirst: (() => void) | null
  walletFiltered: boolean
}) {
  if (count === 0 && !walletFiltered) return null
  return (
    <div className="space-y-1.5">
      {count > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-ink">
          <AlertTriangle size={13} aria-hidden="true" className="shrink-0" />
          <span><strong>{shortfallSummary(count, asset)}</strong>: suele indicar que falta importar operaciones anteriores (o de otra wallet).</span>
          {onOpenFirst && (
            <button type="button" onClick={onOpenFirst}
              className="underline font-semibold rounded focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
              Ver la más antigua
            </button>
          )}
        </p>
      )}
      {walletFiltered && (
        <p className="text-xs text-fg-subtle">
          Saldo de la wallet filtrada: las transferencias que entran en ella desde otra wallet la hacen subir, pero aparecen con la wallet de origen.
        </p>
      )}
    </div>
  )
}
