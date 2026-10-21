import { forwardRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { buttonClasses } from '../../components/ui'
import { formatNumber } from '../../utils/format'
import { PAGE_SIZE } from './useHistoryFilters'

/** Id del destino del enlace «Saltar a la paginación» (#351). */
export const PAGINATION_ID = 'historial-paginacion'

// Controles de página del Historial. El contenedor es enfocable (tabIndex -1)
// para recibir el foco desde el enlace de salto.
export const HistoryPagination = forwardRef<HTMLElement, {
  offset: number; total: number; onOffset: (offset: number) => void
}>(function HistoryPagination({ offset, total, onOffset }, ref) {
  if (total <= PAGE_SIZE) return null
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const page = Math.floor(offset / PAGE_SIZE) + 1
  return (
    <nav ref={ref} id={PAGINATION_ID} tabIndex={-1} aria-label="Paginación del historial"
      className="shrink-0 border-t border-border px-4 py-3 flex items-center justify-between bg-background-primary focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand">
      <span className="text-xs text-fg-subtle">
        {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} de {formatNumber(total, 0)}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onOffset(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0}
          aria-label="Página anterior" className={buttonClasses('secondary', 'md')}>
          <ChevronLeft size={14} aria-hidden="true" />
        </button>
        <span className="text-xs text-fg-subtle px-2 mono" aria-label={`Página ${page} de ${totalPages}`}>{page} / {totalPages}</span>
        <button type="button" onClick={() => onOffset(offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= total}
          aria-label="Página siguiente" className={buttonClasses('secondary', 'md')}>
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
})
