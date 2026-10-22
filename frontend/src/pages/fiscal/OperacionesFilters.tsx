import { AlertTriangle, Search, X } from 'lucide-react'
import { Dropdown, fieldClasses, iconButtonClasses } from '../../components/ui'
import type { EventFilters, ResultFilter } from '../../utils/fiscalOperations'
import type { FiscalTone } from '../../utils/fiscalTable'

// Filtros de la tabla de operaciones (#299): tipo en chips con recuento,
// «con aviso», búsqueda, resultado, activo y fechas.

const RESULTS: { value: ResultFilter; label: string; on: string }[] = [
  { value: 'all', label: 'Todos', on: 'bg-overlay/10 text-fg' },
  { value: 'gain', label: '▲ Ganancias', on: 'bg-positive/20 text-positive-ink' },
  { value: 'loss', label: '▼ Pérdidas', on: 'bg-negative/20 text-negative-ink' },
]

const chip = (on: boolean) =>
  `inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 ${
    on ? 'border-brand/40 bg-brand/15 text-fg' : 'border-border text-fg-muted hover:text-fg'}`

export function OperacionesFilters({ filters, search, onSearch, onChange, tones, warnings, assets, onClear, filtered }: {
  filters: EventFilters
  /** Texto de búsqueda sin el retardo, para que el campo responda al instante. */
  search: string
  onSearch: (q: string) => void
  onChange: (patch: Partial<EventFilters>) => void
  tones: { tone: FiscalTone; label: string; count: number }[]
  warnings: number
  assets: string[]
  onClear: () => void
  filtered: boolean
}) {
  const toggleTone = (t: FiscalTone) =>
    onChange({ tones: filters.tones.includes(t) ? filters.tones.filter(x => x !== t) : [...filters.tones, t] })

  return (
    <div className="space-y-2.5 px-4 pt-3">
      <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Filtrar por tipo">
        {tones.map(t => (
          <button key={t.tone} type="button" aria-pressed={filters.tones.includes(t.tone)} onClick={() => toggleTone(t.tone)} className={chip(filters.tones.includes(t.tone))}>
            {t.label} <span className="mono text-fg-subtle">{t.count}</span>
          </button>
        ))}
        {warnings > 0 && (
          <button type="button" aria-pressed={filters.onlyWarnings} onClick={() => onChange({ onlyWarnings: !filters.onlyWarnings })} className={chip(filters.onlyWarnings)}>
            <AlertTriangle size={11} className="text-warning" aria-hidden="true" /> Con aviso <span className="mono text-fg-subtle">{warnings}</span>
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="relative flex-1 min-w-40 max-w-64">
          <span className="sr-only">Buscar por activo, wallet o clave AEAT</span>
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
          <input type="search" value={search} onChange={e => onSearch(e.target.value)} placeholder="Activo, wallet o clave"
            maxLength={40} className={fieldClasses('sm', false, 'pl-7 py-1')} />
        </label>
        <div className="flex bg-background-tertiary border border-border rounded-lg overflow-hidden text-xs" role="group" aria-label="Filtrar por resultado">
          {RESULTS.map(r => (
            <button key={r.value} type="button" aria-pressed={filters.result === r.value} onClick={() => onChange({ result: r.value })}
              className={`px-2.5 py-1 transition-colors ${filters.result === r.value ? r.on : 'text-fg-subtle hover:text-fg'}`}>
              {r.label}
            </button>
          ))}
        </div>
        <Dropdown size="sm" label="Filtrar por activo" value={filters.asset} onChange={v => onChange({ asset: v })} align="end"
          options={[{ value: '', label: 'Todos los activos' }, ...assets.map(a => ({ value: a, label: a }))]} />
        <div className="flex items-center gap-1">
          <input type="date" value={filters.from} onChange={e => onChange({ from: e.target.value })} aria-label="Desde"
            className={fieldClasses('sm', false, 'w-auto px-2 py-1 cursor-pointer')} />
          <span className="text-fg-subtle text-xs" aria-hidden="true">—</span>
          <input type="date" value={filters.to} onChange={e => onChange({ to: e.target.value })} aria-label="Hasta"
            className={fieldClasses('sm', false, 'w-auto px-2 py-1 cursor-pointer')} />
        </div>
        {filtered && (
          <button type="button" onClick={onClear} className={iconButtonClasses('sm', false, 'w-auto px-2 gap-1 text-xs')}>
            <X size={12} aria-hidden="true" /> Limpiar
          </button>
        )}
      </div>
    </div>
  )
}
