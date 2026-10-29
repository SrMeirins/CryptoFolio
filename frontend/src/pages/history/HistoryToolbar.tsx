import { forwardRef, useState, type ReactNode } from 'react'
import { YearSelector } from './keyboard/YearSelector'
import { RefreshCw, PenLine, Link2, Layers, FilePen, Keyboard, SlidersHorizontal, ChevronDown } from 'lucide-react'
import { DateRangePicker } from '../../components/DateRangePicker'
import { Dropdown, MultiDropdown, iconButtonClasses } from '../../components/ui'
import { fmtShort } from '../../utils/date'
import { typeOptions } from './filterChips'
import { AmountRange } from './AmountRange'
import { HistorySearch } from './HistorySearch'
import { secondaryFilterCount, type Suggestion } from './toolbarLogic'
import { readMoreFiltersOpen, saveMoreFiltersOpen } from './stats/analyticsPrefs'
import type { HistoryFilterState } from './urlState'

// Barra de filtros del Historial por niveles (#414). Primer nivel: buscador
// con sugerencias, tipos, activos, wallet y «Más filtros» con el número de los
// activos dentro. «Más filtros» se despliega en el sitio (no flotante, porque
// el selector de fechas ya es un desplegable): año y fechas, importe, archivo,
// manuales, editadas y agrupar comisiones. «Cuenta» sale de la interfaz: duplica
// a la wallet; los enlaces antiguos siguen funcionando y su chip se quita.

function Toggle({ pressed, onClick, icon, children, title, tone = 'brand' }: {
  pressed: boolean; onClick: () => void; icon: ReactNode; children: ReactNode; title?: string; tone?: 'brand' | 'warning'
}) {
  const on = tone === 'warning' ? 'bg-warning/10 border-warning/40 text-warning-ink' : 'bg-brand/10 border-brand/40 text-brand-ink'
  const hover = tone === 'warning' ? 'hover:border-warning/30' : 'hover:border-brand/30'
  return (
    <button type="button" onClick={onClick} aria-pressed={pressed} title={title}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${
        pressed ? on : `bg-background-tertiary border-border text-fg-muted ${hover}`}`}>
      {icon} {children}
    </button>
  )
}

export const HistoryToolbar = forwardRef<HTMLInputElement, {
  filters: HistoryFilterState
  searchInput: string
  wallets: { id: string; name: string }[]
  assets: string[]
  presentTypes: string[]
  imports: { id: string; filename: string; imported_at: string }[]
  currencySymbol: string
  isFetching: boolean
  setSearchInput: (v: string) => void
  setFilter: <K extends keyof HistoryFilterState>(key: K, value: HistoryFilterState[K]) => void
  patchFilters: (patch: Partial<HistoryFilterState>) => void
  setDateRange: (from: string, to: string) => void
  onCopyLink: () => void
  /** Selector «Año» (#382). */
  year: { years: readonly number[]; value: number | null; onChange: (y: number | null) => void; onStep: (s: -1 | 1) => void; canPrev: boolean; canNext: boolean }
  onHelp: () => void
}>(function HistoryToolbar({
  filters, searchInput, wallets, assets, presentTypes, imports, currencySymbol, isFetching,
  setSearchInput, setFilter, patchFilters, setDateRange, onCopyLink, year, onHelp,
}, searchRef) {
  const [moreOpen, setMoreOpen] = useState(readMoreFiltersOpen)
  const moreCount = secondaryFilterCount(filters)

  function toggleMore() {
    setMoreOpen(o => { saveMoreFiltersOpen(!o); return !o })
  }
  /** Una sugerencia añade su filtro y limpia el texto. */
  function pick(s: Suggestion) {
    if (s.kind === 'asset') patchFilters({ assets: [...filters.assets, s.value], search: '' })
    else patchFilters({ wallet_id: s.value, search: '' })
  }

  return (
    <div className="space-y-2" role="search" aria-label="Filtros del historial">
      <div className="flex items-center gap-2 flex-wrap">
        <HistorySearch ref={searchRef} value={searchInput} onChange={setSearchInput} onClear={() => setFilter('search', '')}
          assets={assets} wallets={wallets} filters={filters} onPick={pick} />
        <MultiDropdown size="sm" label="Filtrar por tipo" placeholder="Todos los tipos" plural="tipos" groupSelectable
          values={filters.types} options={typeOptions(presentTypes)} onChange={v => setFilter('types', v)} />
        <MultiDropdown size="sm" label="Filtrar por activo" placeholder="Todos los activos" plural="activos" searchable
          values={filters.assets} options={assets.map(a => ({ value: a, label: a }))} onChange={v => setFilter('assets', v)} />
        <Dropdown size="sm" label="Filtrar por wallet" value={filters.wallet_id} onChange={v => setFilter('wallet_id', v)}
          options={[{ value: '', label: 'Todas las wallets' }, ...wallets.map(w => ({ value: w.id, label: w.name }))]} />
        <button type="button" onClick={toggleMore} aria-expanded={moreOpen} aria-controls="historial-mas-filtros"
          aria-label={`Más filtros${moreCount ? `, ${moreCount} activos` : ''}`}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${
            moreOpen || moreCount ? 'bg-brand/10 border-brand/40 text-brand-ink' : 'bg-background-tertiary border-border text-fg-muted hover:border-brand/30'}`}>
          <SlidersHorizontal size={12} aria-hidden="true" /> Más filtros
          {moreCount > 0 && <span aria-hidden="true" className="min-w-4 h-4 px-1 rounded-full bg-brand-solid text-white text-[10px] leading-4 text-center">{moreCount}</span>}
          <ChevronDown size={12} aria-hidden="true" className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
        </button>

        <span className="ml-auto flex items-center gap-1">
          {isFetching && <RefreshCw size={11} aria-hidden="true" className="text-fg-subtle animate-spin" />}
          <button type="button" onClick={onHelp} title="Atajos de teclado (?)" aria-keyshortcuts="?"
            className={iconButtonClasses('md')} aria-label="Atajos de teclado">
            <Keyboard size={13} aria-hidden="true" />
          </button>
          <button type="button" onClick={onCopyLink} title="Copiar el enlace de esta vista"
            className={iconButtonClasses('md')} aria-label="Copiar el enlace de esta vista">
            <Link2 size={13} aria-hidden="true" />
          </button>
        </span>
      </div>

      {moreOpen && (
        <div id="historial-mas-filtros" role="group" aria-label="Más filtros"
          className="flex items-center gap-2 flex-wrap rounded-xl border border-border bg-overlay/2 p-2.5">
          <YearSelector years={year.years} value={year.value} onChange={year.onChange} onStep={year.onStep} canPrev={year.canPrev} canNext={year.canNext} />
          <DateRangePicker from={filters.date_from} to={filters.date_to} onChange={setDateRange} />
          <AmountRange min={filters.value_min} max={filters.value_max} symbol={currencySymbol} onChange={patchFilters} />
          {imports.length > 0 && (
            <Dropdown size="sm" label="Filtrar por archivo de importación" value={filters.import_id} onChange={v => setFilter('import_id', v)}
              options={[{ value: '', label: 'Todos los archivos' },
                ...imports.map(i => ({ value: i.id, label: i.filename, description: `Importado el ${fmtShort(i.imported_at.slice(0, 10))}` }))]} />
          )}
          <Toggle pressed={filters.manualOnly} onClick={() => setFilter('manualOnly', !filters.manualOnly)}
            icon={<PenLine size={11} aria-hidden="true" />}>Manuales</Toggle>
          <Toggle pressed={filters.editedOnly} onClick={() => setFilter('editedOnly', !filters.editedOnly)} tone="warning"
            title="Solo transacciones importadas que has editado a mano" icon={<FilePen size={11} aria-hidden="true" />}>Editadas</Toggle>
          <Toggle pressed={filters.groupFees} onClick={() => setFilter('groupFees', !filters.groupFees)}
            title="Mostrar cada comisión dentro de su compra o venta" icon={<Layers size={11} aria-hidden="true" />}>Agrupar comisiones</Toggle>
        </div>
      )}
    </div>
  )
})
