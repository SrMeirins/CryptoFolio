import { useState } from 'react'
import { FileText, Loader2, AlertTriangle, Trash2, Calendar, Hash, ChevronRight, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { portfolioApi } from '../../api/portfolio'
import type { ImportRecord } from '../../api/portfolio'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { iconButtonClasses, Hint } from '../../components/ui'
import { CorregirZonaDialog } from './CorregirZonaDialog'
import { etiquetaDesfase } from './zonaHoraria'
import { textoRetiradas } from './coberturaVista'

export function ImportsList({ imports, onDelete }: {
  imports: ImportRecord[]
  onDelete: (id: string) => Promise<void>
}) {
  const [confirmId, setConfirmId]   = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // Corrección de la zona horaria de un CSV de Binance (#599).
  const [zonaId, setZonaId] = useState<string | null>(null)
  const zonaImport = imports.find(i => i.id === zonaId)
  const totalTx = imports.reduce((s, i) => s + parseInt(i.transaction_count), 0)
  const confirmImport = imports.find(i => i.id === confirmId)
  // Aviso si faltan las retiradas complementarias de Binance (#548); la cobertura ya está en caché.
  // consulta de fondo (#498): es un aviso añadido; si falla, la lista se ve igual sin él.
  const { data: coberturas = [] } = useQuery({ queryKey: ['cobertura'], queryFn: portfolioApi.getCobertura })
  const avisoRetiradas = textoRetiradas(coberturas.find(c => c.exchange === 'binance')?.retiradas)
  const sinRetiradas = avisoRetiradas && !avisoRetiradas.ok ? avisoRetiradas.texto : null

  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Si el borrado falla, se informa y se quita el indicador de carga (#316).
  async function handleConfirmDelete(id: string) {
    setDeletingId(id)
    setConfirmId(null)
    setDeleteError(null)
    try {
      await onDelete(id)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'No se pudo borrar la importación')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-medium text-fg-muted">Historial de importaciones</h3>
        <span className="text-xs text-fg-subtle">
          {imports.length} archivo{imports.length !== 1 ? 's' : ''} · {totalTx} transacciones totales
        </span>
      </div>
      {sinRetiradas && (
        <p role="status" className="px-1 flex items-start gap-1.5 text-xs text-warning-ink">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" aria-hidden="true" /> {sinRetiradas}
        </p>
      )}
      {deleteError && <p role="alert" className="px-1 text-xs text-negative">{deleteError}</p>}

      {imports.map(imp => {
        const txCount       = parseInt(imp.transaction_count)
        const buyCount      = parseInt(imp.buy_count)
        const sellCount     = parseInt(imp.sell_count)
        const withdrawCount = parseInt(imp.withdraw_count)
        const depositCount  = parseInt(imp.deposit_count)
        const dateFrom      = imp.date_from ? new Date(imp.date_from) : null
        const dateTo        = imp.date_to   ? new Date(imp.date_to)   : null
        const isDeleting    = deletingId === imp.id
        const esRetiradas   = imp.tipo === 'retiradas'

        const fmtDate = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
        const fmtImported = new Date(imp.imported_at).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })

        const tagCounts = [
          buyCount > 0      && { label: `${buyCount} compras`,    color: 'text-positive-ink bg-positive/10' },
          sellCount > 0     && { label: `${sellCount} ventas`,    color: 'text-negative-ink bg-negative/10' },
          withdrawCount > 0 && { label: `${withdrawCount} retiros`, color: 'text-warning-ink bg-warning/10' },
          depositCount > 0  && { label: `${depositCount} depósitos`, color: 'text-brand-ink bg-brand/10' },
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
                <FileText size={16} className="text-fg-subtle" aria-hidden="true" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {imp.filename}
                  {esRetiradas && <span className="ml-2 text-xs px-2 py-0.5 rounded-lg bg-background-tertiary text-fg-muted">Retiradas, complementaria</span>}
                </p>
                <p className="text-xs text-fg-subtle mt-0.5">
                  Importado {fmtImported}
                  {esRetiradas && <> · {imp.row_count} retiradas completadas · completa direcciones, red y hash de tus retiros</>}
                  {imp.exchange === 'binance' && !esRetiradas && <> · hora en {etiquetaDesfase(imp.desfase_horas ?? 0)}</>}
                </p>
              </div>

              {dateFrom && dateTo && (
                <div className="text-xs text-fg-subtle mono text-right shrink-0 hidden sm:block">
                  <p className="flex items-center gap-1 justify-end">
                    <Calendar size={10} className="text-fg-subtle" /> {fmtDate(dateFrom)}
                  </p>
                  <p className="text-fg-subtle flex items-center gap-1 justify-end">
                    <ChevronRight size={10} /> {fmtDate(dateTo)}
                  </p>
                </div>
              )}

              {!esRetiradas && (
                <Link to={`/history?import=${encodeURIComponent(imp.id)}`} className="text-xs text-brand hover:underline shrink-0">
                  Ver transacciones
                </Link>
              )}

              {imp.exchange === 'binance' && !esRetiradas && (
                <Hint label="Corregir zona horaria">
                  <button type="button" onClick={() => setZonaId(imp.id)} className={iconButtonClasses('md')}
                    aria-label={`Corregir la zona horaria de ${imp.filename}`}>
                    <Clock size={14} aria-hidden="true" />
                  </button>
                </Hint>
              )}

              <Hint label="Borrar importación">
                <button
                  type="button"
                  onClick={() => setConfirmId(imp.id)}
                  className={iconButtonClasses('md', false, '', 'danger')}
  aria-label={isDeleting ? 'Borrando la importación' : 'Borrar importación'}
                  aria-busy={isDeleting || undefined} disabled={isDeleting}
                >
                  {isDeleting ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}
                </button>
              </Hint>
            </div>

            {/* Tags de resumen */}
            {txCount > 0 && (
              <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded-lg bg-background-tertiary text-fg-muted flex items-center gap-1">
                  <Hash size={10} className="text-fg-subtle" /> {txCount} transacciones
                </span>
                {tagCounts.map(t => (
                  <span key={t.label} className={`text-xs px-2 py-0.5 rounded-lg ${t.color}`}>
                    {t.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {zonaImport && <CorregirZonaDialog imp={zonaImport} onClose={() => setZonaId(null)} />}

      {confirmImport && (
        <ConfirmDialog
          title="Borrar importación"
          message={confirmImport.tipo === 'retiradas'
            ? `Se quitará el registro de «${confirmImport.filename}». Las direcciones, redes y hashes que ya completó en tus retiros se conservan; la cobertura de retiradas volverá a avisar de que falta.`
            : `Se borrarán las ${parseInt(confirmImport.transaction_count)} operaciones de «${confirmImport.filename}» y se recalculará el FIFO, con efecto en tus ganancias y pérdidas. No se puede deshacer.`}
          confirmLabel={confirmImport.tipo === 'retiradas' ? 'Quitar registro' : `Borrar ${parseInt(confirmImport.transaction_count)} ${parseInt(confirmImport.transaction_count) === 1 ? 'operación' : 'operaciones'}`}
          danger
          onConfirm={() => handleConfirmDelete(confirmImport.id)}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </div>
  )
}
