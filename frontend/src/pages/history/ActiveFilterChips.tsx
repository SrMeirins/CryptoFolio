import { X } from 'lucide-react'
import type { FilterChip } from './filterChips'
import type { HistoryFilterState } from './urlState'

/**
 * Barra de filtros activos (#366): un chip por filtro con su botón para
 * quitarlo y «Limpiar todo». Lista semántica, botones con nombre accesible.
 */
export function ActiveFilterChips({ chips, onRemove, onClearAll }: {
  chips: FilterChip[]
  onRemove: (patch: Partial<HistoryFilterState>) => void
  onClearAll: () => void
}) {
  if (chips.length === 0) return null
  return (
    <div className="flex items-center gap-1.5 flex-wrap" aria-label="Filtros activos" role="region">
      <ul className="flex items-center gap-1.5 flex-wrap">
        {chips.map(c => (
          <li key={c.id}
            className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand/8 pl-2.5 pr-1 py-0.5 text-xs text-brand-ink max-w-[260px]">
            <span className="truncate">{c.label}</span>
            <button type="button" onClick={() => onRemove(c.clear)} aria-label={`Quitar filtro ${c.label}`}
              className="rounded-full p-0.5 hover:bg-brand/15 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
              <X size={11} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onClearAll}
        className="text-xs text-fg-muted hover:text-fg underline underline-offset-2 rounded focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
        Limpiar todo
      </button>
    </div>
  )
}
