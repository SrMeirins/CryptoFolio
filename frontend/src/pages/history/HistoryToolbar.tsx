import { forwardRef, useId, useState } from 'react'
import { ChevronDown, FilterX, SlidersHorizontal, X } from 'lucide-react'
import { YearSelector } from './keyboard/YearSelector'
import { Drawer, MultiDropdown, buttonClasses, iconButtonClasses } from '../../components/ui'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { formatNumber } from '../../utils/format'
import { typeOptions } from './filterChips'
import { HistorySearch } from './HistorySearch'
import { quitarDelPanel, secondaryFilterCount, type Suggestion } from './toolbarLogic'
import { readMoreFiltersOpen, saveMoreFiltersOpen } from './stats/analyticsPrefs'
import type { HistoryFilterState } from './urlState'
import { ConQuitar } from './filtros/ConQuitar'
import { PanelFiltros } from './filtros/PanelFiltros'
import { OpcionesVista } from './filtros/OpcionesVista'

// Barra de filtros del Historial (#414, #552). En la barra, los filtros
// rápidos: buscador con sugerencias, tipos, activos y año, todos a la misma
// altura. «Filtros» despliega en el sitio el panel agrupado (qué, dónde,
// cuándo, importes) con el número de los activos dentro; en móvil se abre
// como hoja inferior con «Ver N resultados». Cada filtro aplicado se ve una
// sola vez: en su control (los multiselect muestran sus valores), con su X, y
// «Limpiar filtros (n)» los quita todos. En móvil, los filtros rápidos van en
// una fila que se desliza. Las opciones de vista (agrupar comisiones y
// densidad) van en su propio menú, porque no filtran.

const MOVIL = '(max-width: 639px)'

export const HistoryToolbar = forwardRef<HTMLInputElement, {
  filters: HistoryFilterState
  searchInput: string
  wallets: { id: string; name: string }[]
  assets: string[]
  presentTypes: string[]
  imports: { id: string; filename: string; imported_at: string }[]
  currencySymbol: string
  /** Filtros activos en total (todos los controles), para «Limpiar filtros». */
  activos: number
  /** Operaciones que cumplen los filtros, para «Ver N resultados» en móvil. */
  total: number
  setSearchInput: (v: string) => void
  setFilter: <K extends keyof HistoryFilterState>(key: K, value: HistoryFilterState[K]) => void
  patchFilters: (patch: Partial<HistoryFilterState>) => void
  setDateRange: (from: string, to: string) => void
  onClearAll: () => void
  /** Incluir el margen en el resumen (#403), en Opciones de vista (#553). */
  onIncluirMargen: (v: boolean) => void
  /** Selector «Año» (#382). */
  year: { years: readonly number[]; value: number | null; onChange: (y: number | null) => void; onStep: (s: -1 | 1) => void; canPrev: boolean; canNext: boolean }
}>(function HistoryToolbar({
  filters, searchInput, wallets, assets, presentTypes, imports, currencySymbol, activos, total,
  setSearchInput, setFilter, patchFilters, setDateRange, onClearAll, onIncluirMargen, year,
}, searchRef) {
  const movil = useMediaQuery(MOVIL)
  const tituloHoja = useId()
  const [abiertoEscritorio, setAbiertoEscritorio] = useState(readMoreFiltersOpen)
  const [hoja, setHoja] = useState(false)
  const abierto = movil ? hoja : abiertoEscritorio
  const enPanel = secondaryFilterCount(filters)

  function alternarPanel() {
    if (movil) { setHoja(h => !h); return }
    setAbiertoEscritorio(o => { saveMoreFiltersOpen(!o); return !o })
  }
  /** Una sugerencia añade su filtro y limpia el texto. */
  function pick(s: Suggestion) {
    if (s.kind === 'asset') patchFilters({ assets: [...filters.assets, s.value], search: '' })
    else patchFilters({ wallet_id: s.value, search: '' })
  }

  const panel = (enHoja: boolean) => (
    <PanelFiltros filters={filters} wallets={wallets} imports={imports} currencySymbol={currencySymbol} anio={year.value}
      enPanel={enPanel} onQuitarPanel={() => patchFilters(quitarDelPanel(filters))} hoja={enHoja}
      setFilter={setFilter} patchFilters={patchFilters} setDateRange={setDateRange} />
  )

  return (
    <div className="space-y-2" role="search" aria-label="Filtros del historial">
      <div className="flex items-center gap-2 flex-wrap">
        <HistorySearch ref={searchRef} value={searchInput} onChange={setSearchInput} onClear={() => setFilter('search', '')}
          assets={assets} wallets={wallets} filters={filters} onPick={pick} />
        {/* En móvil, una sola fila que se desliza; en escritorio, en línea con el buscador. */}
        <div className="flex items-center gap-2 max-sm:w-full max-sm:overflow-x-auto max-sm:pb-1 max-sm:[scrollbar-width:none] sm:contents"
          data-testid="filtros-rapidos">
          <ConQuitar activo={filters.types.length > 0} nombre="tipos" onQuitar={() => setFilter('types', [])}>
            <MultiDropdown size="sm" label="Filtrar por tipo" placeholder="Todos los tipos" plural="tipos" groupSelectable verValores={2}
              className="max-w-[16rem]" values={filters.types} options={typeOptions(presentTypes)} onChange={v => setFilter('types', v)} />
          </ConQuitar>
          <ConQuitar activo={filters.assets.length > 0} nombre="activos" onQuitar={() => setFilter('assets', [])}>
            <MultiDropdown size="sm" label="Filtrar por activo" placeholder="Todos los activos" plural="activos" searchable verValores={3}
              className="max-w-[14rem]" values={filters.assets} options={assets.map(a => ({ value: a, label: a }))} onChange={v => setFilter('assets', v)} />
          </ConQuitar>
          <ConQuitar activo={year.value !== null} nombre="año" onQuitar={() => year.onChange(null)}>
            <YearSelector years={year.years} value={year.value} onChange={year.onChange} onStep={year.onStep} canPrev={year.canPrev} canNext={year.canNext} />
          </ConQuitar>
          <button type="button" onClick={alternarPanel} aria-expanded={abierto} aria-controls={movil ? undefined : 'historial-filtros'}
            aria-haspopup={movil ? 'dialog' : undefined}
            aria-label={`Filtros${enPanel ? `, ${enPanel} ${enPanel === 1 ? 'activo' : 'activos'}` : ''}`}
            className={`flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${
              abierto || enPanel ? 'bg-brand/10 border-brand/40 text-brand-ink' : 'bg-background-tertiary border-border text-fg-muted hover:border-brand/30'}`}>
            <SlidersHorizontal size={12} aria-hidden="true" /> Filtros
            {enPanel > 0 && <span aria-hidden="true" className="min-w-4 h-4 px-1 rounded-full bg-brand-solid text-white text-[10px] leading-4 text-center">{enPanel}</span>}
            <ChevronDown size={12} aria-hidden="true" className={`transition-transform ${abierto && !movil ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <span className="ml-auto flex items-center gap-1.5">
          {activos > 0 && (
            <>
              <button type="button" onClick={onClearAll}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-fg-muted hover:text-fg hover:bg-overlay/6 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand whitespace-nowrap">
                <FilterX size={12} aria-hidden="true" /> Limpiar filtros ({activos})
              </button>
              <span aria-hidden="true" className="h-5 w-px bg-border" />
            </>
          )}
          <OpcionesVista agruparComisiones={filters.groupFees} onAgruparComisiones={v => setFilter('groupFees', v)}
            incluirMargen={filters.includeMargin} onIncluirMargen={onIncluirMargen} />
        </span>
      </div>

      {abierto && !movil && panel(false)}

      {/* Móvil (#552): el panel como hoja inferior, con «Ver N resultados» para volver a la lista. */}
      {movil && hoja && (
        <Drawer lado="abajo" labelledBy={tituloHoja} onClose={() => setHoja(false)}>
          <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
            <h2 id={tituloHoja} className="text-base font-semibold text-fg">Filtros</h2>
            <button type="button" onClick={() => setHoja(false)} aria-label="Cerrar los filtros" className={iconButtonClasses('md')}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4">{panel(true)}</div>
          <div className="border-t border-border p-3">
            <button type="button" onClick={() => setHoja(false)} className={buttonClasses('primary', 'md', 'w-full')}>
              Ver {formatNumber(total, 0)} {total === 1 ? 'resultado' : 'resultados'}
            </button>
          </div>
        </Drawer>
      )}
    </div>
  )
})
