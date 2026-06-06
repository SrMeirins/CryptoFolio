import { useState } from 'react'
import { FileText, RefreshCw, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import type { ImportRecord } from '../../api/portfolio'

export function ImportsList({ imports, onDelete }: {
  imports: ImportRecord[]
  onDelete: (id: string) => void
}) {
  const [confirmId, setConfirmId]   = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const confirmTarget = imports.find(i => i.id === confirmId)
  const totalTx = imports.reduce((s, i) => s + parseInt(i.transaction_count), 0)

  async function handleConfirmDelete() {
    if (!confirmId) return
    setDeletingId(confirmId)
    setConfirmId(null)
    await onDelete(confirmId)
    setDeletingId(null)
  }

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-medium text-gray-400">Historial de importaciones</h3>
          <span className="text-xs text-gray-600">
            {imports.length} archivo{imports.length !== 1 ? 's' : ''} · {totalTx} transacciones totales
          </span>
        </div>

        {imports.map(imp => {
          const txCount      = parseInt(imp.transaction_count)
          const buyCount     = parseInt(imp.buy_count)
          const sellCount    = parseInt(imp.sell_count ?? '0')
          const withdrawCount = parseInt(imp.withdraw_count)
          const dateFrom     = imp.date_from ? new Date(imp.date_from) : null
          const dateTo       = imp.date_to   ? new Date(imp.date_to)   : null
          const isDeleting   = deletingId === imp.id

          const fmtDate = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })

          return (
            <div
              key={imp.id}
              className={`rounded-xl border border-border bg-background-card transition-opacity ${isDeleting ? 'opacity-40 pointer-events-none' : ''}`}
            >
              <div className="px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-background-tertiary flex items-center justify-center shrink-0">
                  <FileText size={16} className="text-gray-500" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{imp.filename}</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {new Date(imp.imported_at).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>

                {dateFrom && dateTo && (
                  <div className="text-xs text-gray-500 mono text-right shrink-0 hidden sm:block">
                    <p>{fmtDate(dateFrom)}</p>
                    <p className="text-gray-700">→ {fmtDate(dateTo)}</p>
                  </div>
                )}

                <button
                  onClick={() => setConfirmId(imp.id)}
                  className="p-1.5 text-gray-600 hover:text-accent-red hover:bg-accent-red/10 rounded-lg transition-colors shrink-0"
                >
                  {isDeleting
                    ? <RefreshCw size={14} className="animate-spin" />
                    : <Trash2 size={14} />
                  }
                </button>
              </div>

              {txCount > 0 && (
                <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-md bg-background-tertiary text-gray-400">
                    {txCount} transacciones
                  </span>
                  {buyCount > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-md bg-accent-green/10 text-accent-green">
                      {buyCount} compras
                    </span>
                  )}
                  {sellCount > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-md bg-accent-red/10 text-accent-red">
                      {sellCount} ventas
                    </span>
                  )}
                  {withdrawCount > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-md bg-accent-amber/10 text-accent-amber">
                      {withdrawCount} retiradas
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {confirmTarget && (
        <ConfirmDialog
          title="Borrar importación"
          message={`Borrar "${confirmTarget.filename}"? Se eliminarán todas sus transacciones y se recalculará el FIFO. Esta acción no se puede deshacer.`}
          confirmLabel="Borrar"
          danger
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </>
  )
}
