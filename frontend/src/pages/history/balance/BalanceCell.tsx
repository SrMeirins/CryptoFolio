import { AlertTriangle } from 'lucide-react'
import { formatBalance, shortfallText } from './balanceFormat'

/**
 * Celda del saldo tras la operación (#380). Un hueco se marca con icono y
 * texto (no solo color) y su descripción completa en el título y para lectores.
 */
export function BalanceCell({ value, asset }: { value: { balance: number; missing: number | null } | undefined; asset: string }) {
  if (!value) return <td className="px-3 py-2.5 text-right align-middle text-xs text-fg-subtle"><span aria-hidden="true">—</span><span className="sr-only">Sin saldo</span></td>
  const gap = value.missing !== null ? shortfallText(value.missing, asset) : null
  return (
    <td className="px-3 py-2.5 text-right align-middle whitespace-nowrap">
      <span className="text-xs mono text-fg">{formatBalance(value.balance, asset)}</span>
      {gap && (
        <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs font-semibold text-warning-ink" title={gap}>
          <AlertTriangle size={11} aria-hidden="true" /> hueco<span className="sr-only">. {gap}</span>
        </span>
      )}
    </td>
  )
}
