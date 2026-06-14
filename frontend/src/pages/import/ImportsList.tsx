import { useState } from 'react'
import { FileText, RefreshCw, Trash2, Calendar, Hash, ChevronRight, X, AlertTriangle } from 'lucide-react'
import type { ImportRecord } from '../../api/portfolio'

export function ImportsList({ imports, onDelete }: {
  imports: ImportRecord[]
  onDelete: (id: string) => Promise<void>
}) {
  const [confirmId, setConfirmId]   = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const totalTx = imports.reduce((s, i) => s + parseInt(i.transaction_count), 0)

  async function handleConfirmDelete(id: string) {
    setDeletingId(id)
    setConfirmId(null)
    await onDelete(id)
    setDeletingId(null)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-medium text-gray-400">Historial de importaciones</h3>
        <span className="text-xs text-gray-600">
          {imports.length} archivo{imports.length !== 1 ? 's' : ''} · {totalTx} transacciones totales
        </span>
      </div>

      {imports.map(imp => {
        const txCount       = parseInt(imp.transaction_count)
        const buyCount      = parseInt(imp.buy_count)
        const sellCount     = parseInt(imp.sell_count ?? '0')
        const withdrawCount = parseInt(imp.withdraw_count)
        const depositCount  = parseInt(imp.deposit_count ?? '0')
        const dateFrom      = imp.date_from ? new Date(imp.date_from) : null
        const dateTo        = imp.date_to   ? new Date(imp.date_to)   : null
        const isDeleting    = deletingId === imp.id
        const isConfirming  = confirmId === imp.id

        const fmtDate = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
        const fmtImported = new Date(imp.imported_at).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })

        const tagCounts = [
          buyCount > 0      && { label: `${buyCount} compras`,    color: 'text-accent-green bg-accent-green/10' },
          sellCount > 0     && { label: `${sellCount} ventas`,    color: 'text-accent-red bg-accent-red/10' },
          withdrawCount > 0 && { label: `${withdrawCount} retiros`, color: 'text-accent-amber bg-accent-amber/10' },
          depositCount > 0  && { label: `${depositCount} depósitos`, color: 'text-accent-blue bg-accent-blue/10' },
        ].filter(Boolean) as { label: string; color: string }[]

        return (
          <div
            key={imp.id}
            className={`rounded-xl border overflow-hidden transition-all duration-200 ${
              isConfirming
                ? 'border-accent-red/40 bg-accent-red/5'
                : 'border-border bg-background-card'
            } ${isDeleting ? 'opacity-40 pointer-events-none' : ''}`}
          >
            {/* Fila principal */}
            <div className="px-4 py-3 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                isConfirming ? 'bg-accent-red/15' : 'bg-background-tertiary'
              }`}>
                {isDeleting
                  ? <RefreshCw size={16} className="text-gray-500 animate-spin" />
                  : <FileText size={16} className={isConfirming ? 'text-accent-red/70' : 'text-gray-500'} />
                }
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{imp.filename}</p>
                <p className="text-xs text-gray-600 mt-0.5">
                  Importado {fmtImported}
                </p>
              </div>

              {dateFrom && dateTo && (
                <div className="text-xs text-gray-500 mono text-right shrink-0 hidden sm:block">
                  <p>{fmtDate(dateFrom)}</p>
                  <p className="text-gray-700">→ {fmtDate(dateTo)}</p>
                </div>
              )}

              <button
                onClick={() => setConfirmId(isConfirming ? null : imp.id)}
                className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                  isConfirming
                    ? 'text-accent-red bg-accent-red/15 hover:bg-accent-red/25'
                    : 'text-gray-600 hover:text-accent-red hover:bg-accent-red/10'
                }`}
                title={isConfirming ? 'Cancelar' : 'Borrar importación'}
              >
                {isConfirming ? <X size={14} /> : <Trash2 size={14} />}
              </button>
            </div>

            {/* Tags de resumen — siempre visibles */}
            {txCount > 0 && !isConfirming && (
              <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded-md bg-background-tertiary text-gray-400">
                  {txCount} transacciones
                </span>
                {tagCounts.map(t => (
                  <span key={t.label} className={`text-xs px-2 py-0.5 rounded-md ${t.color}`}>
                    {t.label}
                  </span>
                ))}
              </div>
            )}

            {/* Panel de confirmación inline — se desliza al hacer click en trash */}
            {isConfirming && (
              <div className="px-4 pb-4" style={{ animation: 'importConfirmIn 0.15s ease-out' }}>
                <div className="border-t border-accent-red/20 pt-3 space-y-3">
                  {/* Resumen de lo que se borrará */}
                  <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-gray-500">
                    {dateFrom && dateTo && (
                      <span className="flex items-center gap-1.5">
                        <Calendar size={11} className="text-gray-600" />
                        {fmtDate(dateFrom)} <ChevronRight size={10} className="text-gray-700" /> {fmtDate(dateTo)}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <Hash size={11} className="text-gray-600" />
                      {txCount} transacciones
                    </span>
                  </div>

                  {tagCounts.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tagCounts.map(t => (
                        <span key={t.label} className={`text-xs px-2 py-0.5 rounded-md ${t.color}`}>
                          {t.label}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Advertencia */}
                  <div className="flex items-start gap-2 text-xs text-accent-red/70">
                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                    <span>Se eliminarán todas las transacciones de este archivo y se recalculará el FIFO. Esta acción no se puede deshacer.</span>
                  </div>

                  {/* Botones */}
                  <div className="flex items-center gap-2 justify-end pt-1">
                    <button
                      onClick={() => setConfirmId(null)}
                      className="px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-background-tertiary hover:bg-border rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => handleConfirmDelete(imp.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent-red hover:bg-accent-red/80 text-white rounded-lg transition-colors"
                    >
                      <Trash2 size={11} />
                      Borrar importación
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
