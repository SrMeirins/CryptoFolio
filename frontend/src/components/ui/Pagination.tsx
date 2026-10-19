import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PAGE_SIZES, type PageSize } from '../../utils/pagination'
import { Dropdown } from './Dropdown'
import { iconButtonClasses } from './classes'

// Paginación común (#299): «1–25 de 462», anterior/siguiente y tamaño de página.
export function Pagination({ page, pages, from, to, total, size, onPage, onSize, label }: {
  page: number
  pages: number
  from: number
  to: number
  total: number
  size: PageSize
  onPage: (page: number) => void
  onSize: (size: PageSize) => void
  /** Qué se pagina, para los nombres accesibles («operaciones»). */
  label: string
}) {
  if (total === 0) return null
  return (
    <nav aria-label={`Paginación de ${label}`} className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 text-xs text-fg-subtle">
      <span aria-live="polite" className="mono tabular-nums">{from}–{to} de {total}</span>
      <div className="flex items-center gap-2">
        <Dropdown size="sm" label={`${label} por página`} value={size} onChange={onSize} align="end"
          options={PAGE_SIZES.map(s => ({ value: s, label: `${s} por página` }))} />
        <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1}
          aria-label="Página anterior" className={iconButtonClasses('sm')}>
          <ChevronLeft size={14} aria-hidden="true" />
        </button>
        <span className="mono tabular-nums min-w-12 text-center">{page} / {pages}</span>
        <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages}
          aria-label="Página siguiente" className={iconButtonClasses('sm')}>
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}
