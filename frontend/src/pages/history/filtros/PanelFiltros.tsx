import type { ReactNode } from 'react'
import { CalendarDays, Coins, FilePen, ListFilter, PenLine, Wallet, X, type LucideIcon } from 'lucide-react'
import { DateRangePicker } from '../../../components/DateRangePicker'
import { Dropdown } from '../../../components/ui'
import { fmtShort } from '../../../utils/date'
import { AmountRange } from '../AmountRange'
import type { HistoryFilterState } from '../urlState'
import { ConQuitar } from './ConQuitar'
import { Interruptor } from './Interruptor'

// Panel «Filtros» del Historial (#552), desplegado en el sitio y agrupado en
// cuatro columnas con su título: Qué, Dónde, Cuándo e Importes (una columna en
// pantallas estrechas). Cada control muestra su valor y, aplicado, su X. El año
// completo se elige en la barra: aquí solo las fechas exactas, para no
// repetirlo.

function Grupo({ titulo, icono: Icono, children }: { titulo: string; icono: LucideIcon; children: ReactNode }) {
  return (
    <div role="group" aria-label={titulo} className="min-w-0 space-y-2">
      <p aria-hidden="true" className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-widest text-fg-subtle">
        <span className="flex size-5 items-center justify-center rounded-md bg-brand/10 text-brand-ink"><Icono size={11} /></span>{titulo}
      </p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

export function PanelFiltros({ filters, wallets, imports, currencySymbol, anio, enPanel, setFilter, patchFilters, setDateRange, onQuitarPanel, hoja = false }: {
  filters: HistoryFilterState
  wallets: { id: string; name: string }[]
  imports: { id: string; filename: string; imported_at: string }[]
  currencySymbol: string
  /** Año completo elegido en la barra, o null. */
  anio: number | null
  setFilter: <K extends keyof HistoryFilterState>(key: K, value: HistoryFilterState[K]) => void
  patchFilters: (patch: Partial<HistoryFilterState>) => void
  setDateRange: (from: string, to: string) => void
  /** Filtros activos dentro del panel, para el pie. */
  enPanel: number
  /** Quita solo los filtros del panel. */
  onQuitarPanel: () => void
  /** Dentro de la hoja inferior del móvil: sin borde ni fondo propios. */
  hoja?: boolean
}) {
  const fechasExactas = !!(filters.date_from || filters.date_to) && anio === null
  return (
    <div id="historial-filtros" role="group" aria-label="Filtros"
      className={hoja ? 'space-y-4' : 'rounded-xl border border-border bg-overlay/2 p-3.5 space-y-3'}>
      <div className={`grid gap-x-6 gap-y-4 ${hoja ? '' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>
      <Grupo titulo="Qué" icono={ListFilter}>
        <Interruptor pressed={filters.manualOnly} onClick={() => setFilter('manualOnly', !filters.manualOnly)}
          icon={<PenLine size={11} aria-hidden="true" />}>Manuales</Interruptor>
        <Interruptor pressed={filters.editedOnly} onClick={() => setFilter('editedOnly', !filters.editedOnly)} tone="warning"
          title="Solo transacciones importadas que has editado a mano" icon={<FilePen size={11} aria-hidden="true" />}>Editadas</Interruptor>
      </Grupo>

      <Grupo titulo="Dónde" icono={Wallet}>
        <ConQuitar activo={!!filters.wallet_id} nombre="wallet" onQuitar={() => setFilter('wallet_id', '')}>
          <Dropdown size="sm" label="Filtrar por wallet" value={filters.wallet_id} onChange={v => setFilter('wallet_id', v)}
            options={[{ value: '', label: 'Todas las wallets' }, ...wallets.map(w => ({ value: w.id, label: w.name }))]} />
        </ConQuitar>
        {imports.length > 0 && (
          <ConQuitar activo={!!filters.import_id} nombre="archivo de importación" onQuitar={() => setFilter('import_id', '')}>
            <Dropdown size="sm" label="Filtrar por archivo de importación" value={filters.import_id} onChange={v => setFilter('import_id', v)}
              options={[{ value: '', label: 'Todos los archivos' },
                ...imports.map(i => ({ value: i.id, label: i.filename, description: `Importado el ${fmtShort(i.imported_at.slice(0, 10))}` }))]} />
          </ConQuitar>
        )}
        {/* Cuenta (#414): ya no se elige aquí, pero un enlace antiguo puede traerla; se dice y se puede quitar. */}
        {filters.account && (
          <ConQuitar activo nombre="cuenta" onQuitar={() => setFilter('account', '')}>
            <span className="px-2.5 py-1.5 text-xs text-brand-ink">Cuenta: {filters.account}</span>
          </ConQuitar>
        )}
      </Grupo>

      <Grupo titulo="Cuándo" icono={CalendarDays}>
        <ConQuitar activo={fechasExactas} nombre="fechas" onQuitar={() => setDateRange('', '')} conBoton={false}>
          {/* Con un año completo elegido en la barra, el selector empieza vacío: no repite ese año. */}
          <DateRangePicker from={anio === null ? filters.date_from : ''} to={anio === null ? filters.date_to : ''} onChange={setDateRange} />
        </ConQuitar>
        {anio !== null && <p className="w-full text-[11px] text-fg-subtle">Ahora, el año {anio} completo, elegido en la barra.</p>}
      </Grupo>

      <Grupo titulo="Importes" icono={Coins}>
        <ConQuitar activo={!!(filters.value_min || filters.value_max)} nombre="importe" onQuitar={() => patchFilters({ value_min: '', value_max: '' })}>
          <AmountRange min={filters.value_min} max={filters.value_max} symbol={currencySymbol} onChange={patchFilters} />
        </ConQuitar>
      </Grupo>
      </div>
      {/* Pie (#552): cuántos hay activos aquí y quitar solo estos. */}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5 text-xs text-fg-muted">
        <span>{enPanel === 0 ? 'Ningún filtro activo en el panel' : `${enPanel} ${enPanel === 1 ? 'filtro activo' : 'filtros activos'} en el panel`}</span>
        {enPanel > 0 && (
          <button type="button" onClick={onQuitarPanel}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-brand-ink hover:bg-brand/10 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
            <X size={12} aria-hidden="true" /> Quitar los del panel
          </button>
        )}
      </div>
    </div>
  )
}
