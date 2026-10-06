import { WithdrawalSelector } from './WithdrawalSelector'

// Barra de selección y aplicación masiva de destino — header de WithdrawalDestinations
export function BulkSelectionBar({
  allChecked, someChecked, onToggleAll,
  bulkDest, onBulkDestChange, coldWallets,
  selectedCount, unassignedCount, totalTxs,
  onApplyBulk, onApplyToUnassigned,
  onSelectUnassigned, onSelectAll, onSelectNone,
}: {
  allChecked: boolean
  someChecked: boolean
  onToggleAll: () => void
  bulkDest: string
  onBulkDestChange: (v: string) => void
  coldWallets: { id: string; name: string; color: string }[]
  selectedCount: number
  unassignedCount: number
  totalTxs: number
  onApplyBulk: () => void
  onApplyToUnassigned: () => void
  onSelectUnassigned: () => void
  onSelectAll: () => void
  onSelectNone: () => void
}) {
  return (
    <div className="rounded-xl border border-border bg-background-tertiary">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggleAll}
          className={`w-4.5 h-4.5 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
            allChecked  ? 'bg-accent-blue border-accent-blue' :
            someChecked ? 'bg-accent-blue/30 border-accent-blue' :
                          'border-gray-600 hover:border-gray-400'
          }`}
          title={allChecked ? 'Deseleccionar todo' : 'Seleccionar todo'}
        >
          {allChecked  && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
          {someChecked && <span className="text-accent-blue text-[10px] font-bold leading-none">−</span>}
        </button>

        <div className="flex-1 min-w-0">
          <WithdrawalSelector value={bulkDest} coldWallets={coldWallets} onChange={onBulkDestChange} />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {selectedCount > 0 ? (
            <button
              type="button"
              onClick={onApplyBulk}
              disabled={!bulkDest}
              className="px-3 py-1.5 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-semibold transition-colors whitespace-nowrap flex items-center gap-1.5"
            >
              <span className="bg-white/20 rounded px-1 py-0.5 text-[10px] font-bold">{selectedCount}</span>
              Aplicar
            </button>
          ) : (
            <>
              {unassignedCount > 0 && unassignedCount < totalTxs && (
                <button
                  type="button"
                  onClick={onApplyToUnassigned}
                  disabled={!bulkDest}
                  className="px-3 py-1.5 border border-border hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-medium text-gray-300 transition-colors whitespace-nowrap"
                  title="Aplicar solo a los que aún no tienen destino"
                >
                  No asignados
                </button>
              )}
              <button
                type="button"
                onClick={onApplyBulk}
                disabled={!bulkDest}
                className="px-3 py-1.5 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
              >
                Todos
              </button>
            </>
          )}
        </div>
      </div>

      {selectedCount > 0 && (
        <div className="border-t border-border px-4 py-2 flex items-center gap-3">
          <span className="text-xs text-accent-blue font-medium">
            {selectedCount} seleccionado{selectedCount !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button type="button" onClick={onSelectUnassigned} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">no asignados</button>
            <span className="text-gray-700">·</span>
            <button type="button" onClick={onSelectAll} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">todos</button>
            <span className="text-gray-700">·</span>
            <button type="button" onClick={onSelectNone} className="text-xs text-gray-500 hover:text-accent-red transition-colors">ninguno</button>
          </div>
        </div>
      )}
    </div>
  )
}
