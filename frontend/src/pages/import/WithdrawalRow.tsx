import { WithdrawalSelector } from './WithdrawalSelector'
import { ACCOUNT_COLORS } from './types'
import { fmtAmt } from './withdrawalDestinationsHelpers'
import type { PreviewTransaction } from './types'
import { T, alpha, ink } from '../../utils/colors'

// Fila individual de retiro dentro de un grupo de activo
export function WithdrawalRow({ tx, dest, isSelected, coldWallets, onToggleSelect, onChangeDest }: {
  tx: PreviewTransaction
  dest: string | undefined
  isSelected: boolean
  coldWallets: { id: string; name: string; color: string }[]
  onToggleSelect: () => void
  onChangeDest: (v: string) => void
}) {
  const acColor = ACCOUNT_COLORS[tx.account] ?? T.muted

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 transition-all ${
        isSelected ? 'bg-brand/5' : dest ? 'bg-positive/3' : ''
      }`}
    >
      <button
        type="button"
        onClick={onToggleSelect}
        className={`w-3.5 h-3.5 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
          isSelected ? 'bg-brand-solid text-on-brand border-brand' : 'border-border hover:border-fg-subtle'
        }`}
      >
        {isSelected && <span className="text-fg text-xs font-bold leading-none">✓</span>}
      </button>

      <div className="shrink-0 w-28">
        <p className="text-xs mono text-fg">
          {new Date(tx.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })}
        </p>
        <p className="text-xs mono text-fg-subtle">
          {new Date(tx.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      <span
        className="shrink-0 text-xs px-2 py-0.5 rounded-lg font-medium"
        style={{ backgroundColor: `${alpha(acColor, 9)}`, color: ink(acColor) }}
      >
        {tx.account}
      </span>

      <span className="font-bold mono text-negative text-sm shrink-0">
        −{fmtAmt(tx.amountNet)} <span className="text-fg-subtle font-normal text-xs">{tx.asset}</span>
      </span>

      <div className="flex-1" />

      <WithdrawalSelector
        value={dest ?? ''}
        coldWallets={coldWallets}
        onChange={onChangeDest}
      />
    </div>
  )
}
