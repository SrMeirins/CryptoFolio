import { forwardRef } from 'react'
import { Search, X, RefreshCw, PenLine, FileText } from 'lucide-react'
import { DateRangePicker } from '../../components/DateRangePicker'
import { Dropdown, fieldClasses, iconButtonClasses } from '../../components/ui'
import { OP_META } from '../../constants/operations'
import type { HistoryFilters } from './useHistoryFilters'

// Barra de filtros del Historial (#351): etiqueta de la importación filtrada,
// búsqueda, tipo, wallet, cuenta, fechas y «solo manuales».

export const HistoryToolbar = forwardRef<HTMLInputElement, {
  filters: HistoryFilters
  wallets: { id: string; name: string }[]
  accounts: string[]
  importFilename: string | null
  isFetching: boolean
  setFilter: <K extends keyof HistoryFilters>(key: K, value: HistoryFilters[K]) => void
  setDateRange: (from: string, to: string) => void
  clearImport: () => void
}>(function HistoryToolbar({ filters, wallets, accounts, importFilename, isFetching, setFilter, setDateRange, clearImport }, searchRef) {
  return (
    <>
      {filters.import_id && (
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/8 px-2.5 py-1 text-brand-ink">
            <FileText size={12} aria-hidden="true" />
            De la importación <span className="font-medium">{importFilename ?? '…'}</span>
            <button type="button" onClick={clearImport} aria-label="Quitar el filtro de importación"
              className="ml-0.5 rounded hover:text-fg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60"><X size={11} aria-hidden="true" /></button>
          </span>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap" role="search" aria-label="Filtros del historial">
        <div className="relative">
          <Search size={11} aria-hidden="true" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            ref={searchRef}
            type="search"
            aria-label="Buscar por activo o nota"
            placeholder="Buscar activo o nota…"
            value={filters.search}
            onChange={e => setFilter('search', e.target.value)}
            className={fieldClasses('sm', false, 'pl-7 pr-8 w-48 [&::-webkit-search-cancel-button]:hidden')}
          />
          {filters.search && (
            <button type="button" onClick={() => setFilter('search', '')} aria-label="Limpiar búsqueda"
              className={iconButtonClasses('sm', false, 'absolute right-2 top-1/2 -translate-y-1/2')}>
              <X size={10} aria-hidden="true" />
            </button>
          )}
        </div>

        <Dropdown size="sm" label="Filtrar por tipo" value={filters.type} onChange={v => setFilter('type', v)}
          options={[{ value: '', label: 'Todos los tipos' }, ...Object.entries(OP_META).map(([k, v]) => ({ value: k, label: v.label }))]} />
        <Dropdown size="sm" label="Filtrar por wallet" value={filters.wallet_id} onChange={v => setFilter('wallet_id', v)}
          options={[{ value: '', label: 'Todas las wallets' }, ...wallets.map(w => ({ value: w.id, label: w.name }))]} />
        <Dropdown size="sm" label="Filtrar por cuenta" value={filters.account} onChange={v => setFilter('account', v)}
          options={[{ value: '', label: 'Todas las cuentas' }, ...accounts.map(a => ({ value: a, label: a }))]} />
        <DateRangePicker from={filters.date_from} to={filters.date_to} onChange={setDateRange} />

        <button type="button" onClick={() => setFilter('manualOnly', !filters.manualOnly)} aria-pressed={filters.manualOnly}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${
            filters.manualOnly
              ? 'bg-brand/10 border-brand/40 text-brand-ink'
              : 'bg-background-tertiary border-border text-fg-muted hover:border-brand/30'
          }`}>
          <PenLine size={11} aria-hidden="true" /> Manuales
        </button>

        {isFetching && <RefreshCw size={11} aria-hidden="true" className="text-fg-subtle animate-spin ml-1" />}
      </div>
    </>
  )
})
