import { useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw, Star } from 'lucide-react'
import { ViewTabs } from '../../../components/ui'
import type { HistoryFilterState } from '../urlState'
import type { SortState } from '../sorting'
import { useSavedViews } from '../useSavedViews'
import { stateFromView, viewFiltersFromState, vistasCoincidentes } from '../savedViewsLogic'
import { pestanaSeleccionada, TODAS, vistaModificada } from './pestanasLogic'
import { GuardarVista } from './GuardarVista'
import { GestionVista } from './GestionVista'

// Vistas guardadas del Historial como pestañas de nivel 2 (#369, #492, #552):
// «Todas» (sin filtros) y una por vista, con estrella en la predeterminada.
// Las flechas, Inicio y Fin mueven entre pestañas y aplican la vista al
// llegar (son filtros: no hay petición de más). Si los filtros dejan de
// coincidir, la pestaña de origen queda «modificada» con «Actualizar vista» y
// «Guardar como nueva»; desde «Todas», «Guardar vista». La predeterminada se
// aplica al abrir el Historial sin filtros en la URL.

export const ID_PESTANAS = 'historial-vistas'

export function PestanasVistas({ filters, sort, applyState, clearFilters, hayFiltros, startedEmpty }: {
  filters: HistoryFilterState
  sort: SortState
  applyState: (next: { filters: HistoryFilterState; sort: SortState }) => void
  clearFilters: () => void
  hayFiltros: boolean
  startedEmpty: boolean
}) {
  const saved = useSavedViews()
  const coincidentes = useMemo(() => vistasCoincidentes(saved.views, filters, sort), [saved.views, filters, sort])
  const [origen, setOrigen] = useState<string>(TODAS)

  // La predeterminada, una sola vez al cargar las vistas y solo sin filtros en la URL.
  const aplicada = useRef(false)
  useEffect(() => {
    if (aplicada.current || !startedEmpty || !saved.loaded) return
    aplicada.current = true
    const def = saved.views.find(v => v.predeterminada)
    if (!def) return
    // Una sola vez, al llegar las vistas: la predeterminada queda como pestaña elegida.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con datos que llegan de la API
    setOrigen(def.id)
    applyState(stateFromView(def.filtros))
  }, [startedEmpty, saved.loaded, saved.views, applyState])

  const seleccionada = pestanaSeleccionada(saved.views.map(v => v.id), coincidentes, origen, hayFiltros)
  const modificada = vistaModificada(seleccionada, coincidentes)
  const vistaSel = saved.views.find(v => v.id === seleccionada) ?? null

  function elegir(valor: string) {
    setOrigen(valor)
    if (valor === TODAS) { clearFilters(); return }
    const v = saved.views.find(x => x.id === valor)
    if (v) applyState(stateFromView(v.filtros))
  }

  const guardar = async (nombre: string, predeterminada: boolean, sustituir: boolean) => {
    const r = await saved.create.mutateAsync({ nombre, predeterminada, sustituir, filtros: viewFiltersFromState(filters, sort) })
    setOrigen(r.vista.id)
  }

  return (
    <div className="flex items-end gap-2 border-b border-border" data-testid="pestanas-vistas">
      <ViewTabs idBase={ID_PESTANAS} label="Vistas guardadas" value={seleccionada} onChange={elegir} className="border-b-0 min-w-0 shrink"
        items={[
          { value: TODAS, label: 'Todas' },
          ...saved.views.map(v => ({
            value: v.id,
            label: (
              <span className="inline-flex items-center gap-1.5 max-w-[14rem]">
                {v.predeterminada && <Star size={11} aria-hidden="true" className="shrink-0 text-warning-ink" fill="currentColor" />}
                <span className="truncate">{v.nombre}</span>
                {v.predeterminada && <span className="sr-only"> (predeterminada)</span>}
                {modificada && v.id === seleccionada && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-normal text-warning-ink">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />modificada
                  </span>
                )}
              </span>
            ),
          })),
        ]} />
      {/* Sin vistas guardadas, una pista discreta de para qué sirven (#552). */}
      {saved.loaded && !saved.fallo && saved.views.length === 0 && (
        <p className="hidden md:block pb-2.5 text-[11px] text-fg-subtle truncate">
          Guarda una combinación de filtros como vista para volver a ella con un clic.
        </p>
      )}
      <div className="flex items-center gap-1 pb-1.5 shrink-0 ml-auto">
        {saved.fallo && (
          <button type="button" onClick={saved.fallo.retry} className="px-2 py-1 text-xs text-negative-ink hover:underline">
            No se pudieron cargar las vistas. Reintentar
          </button>
        )}
        {modificada && vistaSel && (
          <button type="button" onClick={() => void saved.update.mutateAsync({ id: vistaSel.id, filtros: viewFiltersFromState(filters, sort) })}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-brand-ink hover:bg-brand/10 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand whitespace-nowrap">
            <RefreshCw size={12} aria-hidden="true" /> Actualizar vista
          </button>
        )}
        {(modificada || (seleccionada === TODAS && hayFiltros && coincidentes.length === 0)) && (
          <GuardarVista etiqueta={modificada ? 'Guardar como nueva' : 'Guardar vista'} onGuardar={guardar} />
        )}
        {vistaSel && (
          <GestionVista key={vistaSel.id} vista={vistaSel}
            onRenombrar={async nombre => { await saved.update.mutateAsync({ id: vistaSel.id, nombre }) }}
            onPredeterminada={async () => { await saved.update.mutateAsync({ id: vistaSel.id, predeterminada: !vistaSel.predeterminada }) }}
            onBorrar={async () => { await saved.remove.mutateAsync(vistaSel.id); setOrigen(TODAS) }} />
        )}
      </div>
    </div>
  )
}
