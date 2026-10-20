import { WithdrawalSelector } from './WithdrawalSelector'
import { ACCOUNT_COLORS } from './types'
import { fmtAmt } from './withdrawalDestinationsHelpers'
import type { PreviewTransaction } from './types'
import { T, alpha, ink } from '../../utils/colors'
import { Casilla } from './Casilla'

// Retiro individual dentro de un grupo de activo, por si alguno va a otro sitio (#321).
export function WithdrawalRow({ tx, dest, isSelected, coldWallets, onToggleSelect, onChangeDest }: {
  tx: PreviewTransaction
  dest: string | undefined
  isSelected: boolean
  coldWallets: { id: string; name: string; color: string }[]
  onToggleSelect: () => void
  onChangeDest: (v: string) => void
}) {
  const acColor = ACCOUNT_COLORS[tx.account] ?? T.muted
  const fecha = new Date(tx.timestamp)
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 flex-wrap transition-colors ${isSelected ? 'bg-brand/5' : dest ? 'bg-positive/3' : ''}`}>
      <Casilla size="sm" estado={isSelected} onChange={onToggleSelect} label={`Seleccionar el retiro de ${fmtAmt(tx.amountNet)} ${tx.asset}`} />
      <span className="w-24 shrink-0 text-xs mono">
        <span className="block text-fg">{fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })}</span>
        <span className="block text-fg-subtle">{fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
      </span>
      <span className="shrink-0 text-xs px-2 py-0.5 rounded-lg font-medium" style={{ backgroundColor: alpha(acColor, 9), color: ink(acColor) }}>{tx.account}</span>
      <span className="font-bold mono text-negative text-sm shrink-0">−{fmtAmt(tx.amountNet)} <span className="text-fg-subtle font-normal text-xs">{tx.asset}</span></span>
      <span className="flex-1" />
      <WithdrawalSelector value={dest ?? ''} coldWallets={coldWallets} onChange={onChangeDest} />
    </div>
  )
}
