import { WithdrawalSelector } from './WithdrawalSelector'
import { ACCOUNT_COLORS } from './types'
import { fmtAmt } from './withdrawalDestinationsHelpers'
import type { PreviewTransaction } from './types'

// Fila individual de retiro dentro de un grupo de activo
export function WithdrawalRow({ tx, dest, isSelected, coldWallets, onToggleSelect, onChangeDest }: {
  tx: PreviewTransaction
  dest: string | undefined
  isSelected: boolean
  coldWallets: { id: string; name: string; color: string }[]
  onToggleSelect: () => void
  onChangeDest: (v: string) => void
}) {
  const acColor = ACCOUNT_COLORS[tx.account] ?? '#6b7280'

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 transition-all ${
        isSelected ? 'bg-accent-blue/5' : dest ? 'bg-accent-green/3' : ''
      }`}
    >
      <button
        type="button"
        onClick={onToggleSelect}
        className={`w-3.5 h-3.5 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
          isSelected ? 'bg-accent-blue border-accent-blue' : 'border-gray-700 hover:border-gray-500'
        }`}
      >
        {isSelected && <span className="text-white text-[8px] font-bold leading-none">✓</span>}
      </button>

      <div className="shrink-0 w-28">
        <p className="text-xs mono text-gray-300">
          {new Date(tx.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })}
        </p>
        <p className="text-xs mono text-gray-600">
          {new Date(tx.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      <span
        className="shrink-0 text-xs px-2 py-0.5 rounded-lg font-medium"
        style={{ backgroundColor: `${acColor}18`, color: acColor }}
      >
        {tx.account}
      </span>

      <span className="font-bold mono text-accent-red text-sm shrink-0">
        −{fmtAmt(tx.amountNet)} <span className="text-gray-500 font-normal text-xs">{tx.asset}</span>
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
