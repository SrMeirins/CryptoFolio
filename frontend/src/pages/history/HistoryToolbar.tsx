import { forwardRef } from 'react'
import { YearSelector } from './keyboard/YearSelector'
import { Search, X, RefreshCw, PenLine, Link2, Layers, FilePen, Keyboard } from 'lucide-react'
import { DateRangePicker } from '../../components/DateRangePicker'
import { Dropdown, MultiDropdown, fieldClasses, iconButtonClasses } from '../../components/ui'
import { fmtShort } from '../../utils/date'
import { typeOptions } from './filterChips'
import { AmountRange } from './AmountRange'
import type { HistoryFilterState } from './urlState'

// Barra de filtros del Historial (#351, #366): búsqueda, tipos (varios, por
// grupos), activos (varios), wallet, cuenta, archivo de importación, fechas,
// rango de importe, «solo manuales», «editadas» (#378), selector «Año» y ayuda de
// atajos (#382) y copiar el enlace de la vista.

export const HistoryToolbar = forwardRef<HTMLInputElement, {
  filters: HistoryFilterState
  searchInput: string
  wallets: { id: string; name: string }[]
  accounts: string[]
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
  filters, searchInput, wallets, accounts, assets, presentTypes, imports, currencySymbol, isFetching,
  setSearchInput, setFilter, patchFilters, setDateRange, onCopyLink, year, onHelp,
}, searchRef) {
  return (
    <div className="flex items-center gap-2 flex-wrap" role="search" aria-label="Filtros del historial">
      <div className="relative">
        <Search size={11} aria-hidden="true" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <input
          ref={searchRef}
          type="search"
          aria-label="Buscar por activo, nota, hash o archivo (atajo: /)"
          aria-keyshortcuts="/"
          placeholder="Buscar activo, nota, hash…"
          value={searchInput}
          maxLength={100}
          onChange={e => setSearchInput(e.target.value)}
          className={fieldClasses('sm', false, 'pl-7 pr-8 w-52 [&::-webkit-search-cancel-button]:hidden')}
        />
        {searchInput && (
          <button type="button" onClick={() => setFilter('search', '')} aria-label="Limpiar búsqueda"
            className={iconButtonClasses('sm', false, 'absolute right-2 top-1/2 -translate-y-1/2')}>
            <X size={10} aria-hidden="true" />
          </button>
        )}
      </div>

      <MultiDropdown size="sm" label="Filtrar por tipo" placeholder="Todos los tipos" plural="tipos" groupSelectable
        values={filters.types} options={typeOptions(presentTypes)} onChange={v => setFilter('types', v)} />
      <MultiDropdown size="sm" label="Filtrar por activo" placeholder="Todos los activos" plural="activos" searchable
        values={filters.assets} options={assets.map(a => ({ value: a, label: a }))} onChange={v => setFilter('assets', v)} />
      <Dropdown size="sm" label="Filtrar por wallet" value={filters.wallet_id} onChange={v => setFilter('wallet_id', v)}
        options={[{ value: '', label: 'Todas las wallets' }, ...wallets.map(w => ({ value: w.id, label: w.name }))]} />
      <Dropdown size="sm" label="Filtrar por cuenta" value={filters.account} onChange={v => setFilter('account', v)}
        options={[{ value: '', label: 'Todas las cuentas' }, ...accounts.map(a => ({ value: a, label: a }))]} />
      {imports.length > 0 && (
        <Dropdown size="sm" label="Filtrar por archivo de importación" value={filters.import_id} onChange={v => setFilter('import_id', v)}
          options={[{ value: '', label: 'Todos los archivos' },
            ...imports.map(i => ({ value: i.id, label: i.filename, description: `Importado el ${fmtShort(i.imported_at.slice(0, 10))}` }))]} />
      )}
      <YearSelector years={year.years} value={year.value} onChange={year.onChange} onStep={year.onStep} canPrev={year.canPrev} canNext={year.canNext} />
      <DateRangePicker from={filters.date_from} to={filters.date_to} onChange={setDateRange} />
      <AmountRange min={filters.value_min} max={filters.value_max} symbol={currencySymbol} onChange={patchFilters} />

      <button type="button" onClick={() => setFilter('manualOnly', !filters.manualOnly)} aria-pressed={filters.manualOnly}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${
          filters.manualOnly
            ? 'bg-brand/10 border-brand/40 text-brand-ink'
            : 'bg-background-tertiary border-border text-fg-muted hover:border-brand/30'
        }`}>
        <PenLine size={11} aria-hidden="true" /> Manuales
      </button>

      <button type="button" onClick={() => setFilter('editedOnly', !filters.editedOnly)} aria-pressed={filters.editedOnly}
        title="Solo transacciones importadas que has editado a mano"
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${
          filters.editedOnly
            ? 'bg-warning/10 border-warning/40 text-warning-ink'
            : 'bg-background-tertiary border-border text-fg-muted hover:border-warning/30'
        }`}>
        <FilePen size={11} aria-hidden="true" /> Editadas
      </button>

      <button type="button" onClick={() => setFilter('groupFees', !filters.groupFees)} aria-pressed={filters.groupFees}
        title="Mostrar cada comisión dentro de su compra o venta"
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${
          filters.groupFees
            ? 'bg-brand/10 border-brand/40 text-brand-ink'
            : 'bg-background-tertiary border-border text-fg-muted hover:border-brand/30'
        }`}>
        <Layers size={11} aria-hidden="true" /> Agrupar comisiones
      </button>

      <button type="button" onClick={onHelp} title="Atajos de teclado (?)" aria-keyshortcuts="?"
        className={iconButtonClasses('md', false, 'ml-auto')} aria-label="Atajos de teclado">
        <Keyboard size={13} aria-hidden="true" />
      </button>
      <button type="button" onClick={onCopyLink} title="Copiar el enlace de esta vista"
        className={iconButtonClasses('md')} aria-label="Copiar el enlace de esta vista">
        <Link2 size={13} aria-hidden="true" />
      </button>

      {isFetching && <RefreshCw size={11} aria-hidden="true" className="text-fg-subtle animate-spin" />}
    </div>
  )
})
