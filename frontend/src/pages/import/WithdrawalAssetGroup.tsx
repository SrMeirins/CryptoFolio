import { Copy } from 'lucide-react'
import { WithdrawalRow } from './WithdrawalRow'
import { txKey, fmtAmt, destLabel } from './withdrawalDestinationsHelpers'
import type { PreviewTransaction } from './types'

// Grupo de retiros por activo — cabecera con estado/acciones + filas individuales
export function WithdrawalAssetGroup({
  asset, txs, totalAmt, firstDate, groupAllSelected, groupSomeSelected,
  status, assetAssignedCount, isOpen, displayIdx, prevDest, hasUnassigned,
  bulkDest, destinations, selected, coldWallets,
  onToggleGroupSelect, onToggleExpand, onCopyPrevGroupDest, onApplyToGroup,
  onToggleTxSelect, onChangeDest,
}: {
  asset: string
  txs: PreviewTransaction[]
  totalAmt: number
  firstDate: string
  groupAllSelected: boolean
  groupSomeSelected: boolean
  status: { label: string | null; color: string }
  assetAssignedCount: number
  isOpen: boolean
  displayIdx: number
  prevDest: string | null
  hasUnassigned: boolean
  bulkDest: string
  destinations: Record<string, string>
  selected: Set<string>
  coldWallets: { id: string; name: string; color: string }[]
  onToggleGroupSelect: () => void
  onToggleExpand: () => void
  onCopyPrevGroupDest: () => void
  onApplyToGroup: () => void
  onToggleTxSelect: (key: string) => void
  onChangeDest: (key: string, v: string) => void
}) {
  return (
    <div className="rounded-xl border border-border">
      <div className="flex items-center gap-3 px-4 py-3 bg-background-tertiary/60">
        <button
          type="button"
          onClick={onToggleGroupSelect}
          className={`w-4 h-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
            groupAllSelected  ? 'bg-accent-blue border-accent-blue' :
            groupSomeSelected ? 'bg-accent-blue/30 border-accent-blue' :
                                'border-gray-600 hover:border-gray-400'
          }`}
        >
          {groupAllSelected  && <span className="text-white text-[9px] font-bold leading-none">✓</span>}
          {groupSomeSelected && <span className="text-accent-blue text-[9px] font-bold leading-none">−</span>}
        </button>

        <button
          type="button"
          onClick={() => txs.length > 1 && onToggleExpand()}
          className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
        >
          <div className={`w-2 h-2 rounded-full shrink-0 ${
            assetAssignedCount === txs.length ? 'bg-accent-green' :
            assetAssignedCount > 0           ? 'bg-accent-amber' : 'bg-gray-600'
          }`} />
          <span className="font-bold mono">{asset}</span>
          <span className="text-xs text-gray-500">
            {txs.length} retiro{txs.length !== 1 ? 's' : ''} · {fmtAmt(totalAmt)} · desde {firstDate}
          </span>
          {status.label && (
            <span className={`text-xs font-medium ${status.color} ml-1`}>
              → {status.label === 'múltiples' ? 'múltiples destinos' : destLabel(status.label, coldWallets).text}
            </span>
          )}
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {displayIdx > 0 && prevDest && hasUnassigned && (
            <button
              type="button"
              onClick={onCopyPrevGroupDest}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors px-1.5 py-1 rounded hover:bg-white/5"
              title={`Aplicar mismo destino que grupo anterior: ${destLabel(prevDest, coldWallets).text}`}
            >
              <Copy size={11} />
              <span className="text-[10px]">{destLabel(prevDest, coldWallets).text}</span>
            </button>
          )}
          {bulkDest && hasUnassigned && (
            <button
              type="button"
              onClick={onApplyToGroup}
              className="text-xs text-accent-blue hover:text-accent-blue/80 font-medium transition-colors whitespace-nowrap"
              title={`Aplicar destino seleccionado a todos los retiros de ${asset}`}
            >
              Aplicar al grupo
            </button>
          )}
          {txs.length > 1 && (
            <button type="button" onClick={onToggleExpand} className="text-gray-500 hover:text-gray-300 transition-colors">
              {isOpen ? '▲' : '▶'}
            </button>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="divide-y divide-border">
          {txs.map((tx, i) => {
            const key = txKey(tx)
            return (
              <WithdrawalRow
                key={i}
                tx={tx}
                dest={destinations[key]}
                isSelected={selected.has(key)}
                coldWallets={coldWallets}
                onToggleSelect={() => onToggleTxSelect(key)}
                onChangeDest={v => onChangeDest(key, v)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
