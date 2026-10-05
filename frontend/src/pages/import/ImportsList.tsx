import { useState } from 'react'
import { FileText, RefreshCw, Trash2, Calendar, Hash, ChevronRight } from 'lucide-react'
import type { ImportRecord } from '../../api/portfolio'
import { ConfirmDialog } from '../../components/ConfirmDialog'

export function ImportsList({ imports, onDelete }: {
  imports: ImportRecord[]
  onDelete: (id: string) => Promise<void>
}) {
  const [confirmId, setConfirmId]   = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const totalTx = imports.reduce((s, i) => s + parseInt(i.transaction_count), 0)
  const confirmImport = imports.find(i => i.id === confirmId)

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
        const sellCount     = parseInt(imp.sell_count)
        const withdrawCount = parseInt(imp.withdraw_count)
        const depositCount  = parseInt(imp.deposit_count)
        const dateFrom      = imp.date_from ? new Date(imp.date_from) : null
        const dateTo        = imp.date_to   ? new Date(imp.date_to)   : null
        const isDeleting    = deletingId === imp.id

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
            className={`rounded-xl border border-border bg-background-card overflow-hidden transition-opacity duration-200 ${
              isDeleting ? 'opacity-40 pointer-events-none' : ''
            }`}
          >
            {/* Fila principal */}
            <div className="px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-background-tertiary">
                {isDeleting
                  ? <RefreshCw size={16} className="text-gray-500 animate-spin" />
                  : <FileText size={16} className="text-gray-500" />
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
                  <p className="flex items-center gap-1 justify-end">
                    <Calendar size={10} className="text-gray-700" /> {fmtDate(dateFrom)}
                  </p>
                  <p className="text-gray-700 flex items-center gap-1 justify-end">
                    <ChevronRight size={10} /> {fmtDate(dateTo)}
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={() => setConfirmId(imp.id)}
                className="p-1.5 rounded-lg transition-colors shrink-0 text-gray-600 hover:text-accent-red hover:bg-accent-red/10"
                title="Borrar importación"
              >
                <Trash2 size={14} />
              </button>
            </div>

            {/* Tags de resumen */}
            {txCount > 0 && (
              <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded-md bg-background-tertiary text-gray-400 flex items-center gap-1">
                  <Hash size={10} className="text-gray-600" /> {txCount} transacciones
                </span>
                {tagCounts.map(t => (
                  <span key={t.label} className={`text-xs px-2 py-0.5 rounded-md ${t.color}`}>
                    {t.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {confirmImport && (
        <ConfirmDialog
          title="Borrar importación"
          message={`Se eliminarán las ${parseInt(confirmImport.transaction_count)} transacciones de "${confirmImport.filename}" y se recalculará el FIFO. Esta acción no se puede deshacer.`}
          confirmLabel="Borrar importación"
          danger
          onConfirm={() => handleConfirmDelete(confirmImport.id)}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </div>
  )
}
