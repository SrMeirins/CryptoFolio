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
            allChecked  ? 'bg-brand-solid text-on-brand border-brand' :
            someChecked ? 'bg-brand/30 border-brand' :
                          'border-border hover:border-fg-subtle'
          }`}
          title={allChecked ? 'Deseleccionar todo' : 'Seleccionar todo'}
        >
          {allChecked  && <span className="text-fg text-xs font-bold leading-none">✓</span>}
          {someChecked && <span className="text-brand text-xs font-bold leading-none">−</span>}
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
              className="px-3 py-1.5 bg-brand-solid text-on-brand hover:bg-brand-solid/90 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-semibold transition-colors whitespace-nowrap flex items-center gap-1.5"
            >
              <span className="bg-overlay/20 rounded-lg px-1 py-0.5 text-xs font-bold">{selectedCount}</span>
              Aplicar
            </button>
          ) : (
            <>
              {unassignedCount > 0 && unassignedCount < totalTxs && (
                <button
                  type="button"
                  onClick={onApplyToUnassigned}
                  disabled={!bulkDest}
                  className="px-3 py-1.5 border border-border hover:border-fg-subtle disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-medium text-fg transition-colors whitespace-nowrap"
                  title="Aplicar solo a los que aún no tienen destino"
                >
                  No asignados
                </button>
              )}
              <button
                type="button"
                onClick={onApplyBulk}
                disabled={!bulkDest}
                className="px-3 py-1.5 bg-brand-solid text-on-brand hover:bg-brand-solid/90 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
              >
                Todos
              </button>
            </>
          )}
        </div>
      </div>

      {selectedCount > 0 && (
        <div className="border-t border-border px-4 py-2 flex items-center gap-3">
          <span className="text-xs text-brand font-medium">
            {selectedCount} seleccionado{selectedCount !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button type="button" onClick={onSelectUnassigned} className="text-xs text-fg-subtle hover:text-fg transition-colors">no asignados</button>
            <span className="text-fg-subtle">·</span>
            <button type="button" onClick={onSelectAll} className="text-xs text-fg-subtle hover:text-fg transition-colors">todos</button>
            <span className="text-fg-subtle">·</span>
            <button type="button" onClick={onSelectNone} className="text-xs text-fg-subtle hover:text-negative transition-colors">ninguno</button>
          </div>
        </div>
      )}
    </div>
  )
}
