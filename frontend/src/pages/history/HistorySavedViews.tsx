import { useEffect, useMemo, useRef } from 'react'
import { useToast } from '../../hooks/useToast'
import { SavedViewsMenu } from './SavedViewsMenu'
import { useSavedViews } from './useSavedViews'
import { activeView, stateFromView, viewFiltersFromState } from './savedViewsLogic'
import type { SortState } from './sorting'
import type { HistoryFilterState } from './urlState'

/**
 * Vistas guardadas del Historial (#369): conecta el desplegable con la API y
 * con el estado de los filtros, y aplica la predeterminada al abrir sin
 * parámetros en la URL (un enlace con filtros siempre manda).
 */
export function HistorySavedViews({ filters, sort, applyState, startedEmpty }: {
  filters: HistoryFilterState
  sort: SortState
  applyState: (next: { filters: HistoryFilterState; sort: SortState }) => void
  startedEmpty: boolean
}) {
  const toast = useToast()
  const saved = useSavedViews()
  const current = useMemo(() => activeView(saved.views, filters, sort), [saved.views, filters, sort])

  // Una sola vez, al cargar las vistas: un ref (no estado) porque no repinta nada.
  const defaultApplied = useRef(false)
  useEffect(() => {
    if (defaultApplied.current || !startedEmpty || !saved.loaded) return
    defaultApplied.current = true
    const def = saved.views.find(v => v.predeterminada)
    if (def) applyState(stateFromView(def.filtros))
  }, [startedEmpty, saved.loaded, saved.views, applyState])

  return (
    <SavedViewsMenu views={saved.views} active={current}
      onApply={v => applyState(stateFromView(v.filtros))}
      onSave={async (nombre, predeterminada, sustituir) => {
        const r = await saved.create.mutateAsync({ nombre, predeterminada, sustituir, filtros: viewFiltersFromState(filters, sort) })
        toast.success(r.sustituida ? 'Vista sustituida' : 'Vista guardada', r.vista.nombre)
      }}
      onRename={async (id, nombre) => { await saved.update.mutateAsync({ id, nombre }) }}
      onDelete={async id => { await saved.remove.mutateAsync(id) }}
      onToggleDefault={async v => { await saved.update.mutateAsync({ id: v.id, predeterminada: !v.predeterminada }) }} />
  )
}
