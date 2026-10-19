import { useMemo, useState } from 'react'
import { TrendingUp, Filter, Download } from 'lucide-react'
import { formatEur, pnlColor } from '../../utils/format'
import { SortIcon } from '../../components/SortIcon'
import { TableExpandToggle } from './TableExpandToggle'
import { FiscalEventCard, FiscalEventRow } from './FiscalEventRow'
import { OperacionesFilters } from './OperacionesFilters'
import { RecompraSummary } from './RecompraSummary'
import { WarningsLegend } from './EventWarnings'
import type { FiscalEvent, FiscalSummary } from './types'
import { buttonClasses, cardClasses, Pagination, tableFootRowClasses, tableHeadRowClasses } from '../../components/ui'
import { useDebounce } from '../../hooks/useDebounce'
import { usePrivacyStore } from '../../store/privacyStore'
import { paginate, type PageSize } from '../../utils/pagination'
import {
  buildEventsCsv, EMPTY_FILTERS, filterEvents, hasWarning, isFiltered, recompraSummary, sortEvents, toneCounts,
  type EventFilters, type SortDir, type SortKey,
} from '../../utils/fiscalOperations'

// Tabla de ganancias y pérdidas patrimoniales (#299): filtros, paginación,
// resumen de recompras, avisos como iconos, tarjetas en móvil y CSV de lo filtrado.
export function TablaEventos({ events, summary, initialFilters }: {
  events: FiscalEvent[]
  summary: FiscalSummary
  /** Filtros con los que se abre la tabla, p. ej. desde un gráfico (#301). */
  initialFilters?: Partial<EventFilters>
}) {
  const [expanded, setExpanded] = useState(true)
  const [filtersState, setFilters] = useState<EventFilters>(() => ({ ...EMPTY_FILTERS, ...initialFilters }))
  const [searchInput, setSearchInput] = useState('')
  const search = useDebounce(searchInput, 200)
  const [sortKey, setSortKey] = useState<SortKey>('fecha')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [size, setSize] = useState<PageSize>(25)
  const privacy = usePrivacyStore(s => s.hidden)

  const filters = useMemo(() => ({ ...filtersState, search }), [filtersState, search])
  // Cualquier cambio de filtro, orden o tamaño vuelve a la página 1, sin efectos encadenados.
  const viewKey = JSON.stringify([filters, sortKey, sortDir, size, events.length])
  const [pageState, setPageState] = useState({ key: viewKey, page: 1 })
  const page = pageState.key === viewKey ? pageState.page : 1

  const assets = useMemo(() => {
    const set = new Set<string>()
    events.forEach(e => { set.add(e.activoTransmitido); if (e.activoRecibido) set.add(e.activoRecibido) })
    return [...set].sort()
  }, [events])
  const tones = useMemo(() => toneCounts(events), [events])
  const warnings = useMemo(() => events.filter(hasWarning).length, [events])
  const recompras = useMemo(() => recompraSummary(events), [events])

  const filtered = useMemo(() => sortEvents(filterEvents(events, filters), sortKey, sortDir), [events, filters, sortKey, sortDir])
  const view = paginate(filtered, page, size)

  const totales = useMemo(() => filtered.reduce((acc, e) => ({
    gananciaPerdida:   acc.gananciaPerdida   + (e.gananciaPerdidaEur ?? 0),
    valorTransmision:  acc.valorTransmision  + e.valorTransmisionEur,
    gastosTransmision: acc.gastosTransmision + e.gastosTransmisionEur,
    valorAdquisicion:  acc.valorAdquisicion  + e.valorAdquisicionEur,
    gastosAdquisicion: acc.gastosAdquisicion + e.gastosAdquisicionEur,
  }), { gananciaPerdida: 0, valorTransmision: 0, gastosTransmision: 0, valorAdquisicion: 0, gastosAdquisicion: 0 }), [filtered])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }
  const patch = (p: Partial<EventFilters>) => setFilters(f => ({ ...f, ...p }))
  const clear = () => { setFilters(EMPTY_FILTERS); setSearchInput('') }

  function exportCsv() {
    const blob = new Blob(['﻿' + buildEventsCsv(filtered)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `operaciones_fiscal_${summary.year}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const isPartial = filtered.length < events.length

  return (
    // @container: tabla o tarjetas según el ancho de la tarjeta, no de la ventana (con la barra lateral, 1024 px no bastan).
    <div className={cardClasses('none', 'overflow-hidden @container')}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-wrap gap-2">
        <TableExpandToggle icon={TrendingUp} title="Ganancias y Pérdidas Patrimoniales" count={events.length}
          expanded={expanded} onToggle={() => setExpanded(!expanded)} />
        {expanded && (
          <button type="button" onClick={exportCsv} disabled={privacy || filtered.length === 0}
            className={buttonClasses('secondary', 'sm', 'flex gap-1')}
            title={privacy ? 'Desactiva el modo privacidad para exportar' : 'Exportar a CSV las operaciones filtradas'}>
            <Download size={11} aria-hidden="true" /> {isPartial ? 'CSV de lo filtrado' : 'CSV de operaciones'}
          </button>
        )}
      </div>

      {expanded && (
        <>
          <RecompraSummary data={recompras} active={filtersState.onlyRecompra} onToggle={() => patch({ onlyRecompra: !filtersState.onlyRecompra })} />
          <OperacionesFilters filters={filtersState} search={searchInput} onSearch={setSearchInput} onChange={patch}
            tones={tones} warnings={warnings} assets={assets} onClear={clear} filtered={isFiltered(filters)} />

          {filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-fg-subtle text-xs">
              <Filter size={20} className="mx-auto mb-2 opacity-30" aria-hidden="true" />
              Sin operaciones con los filtros actuales
            </p>
          ) : (
            <>
              {/* Tarjetas en contenedores estrechos; tabla a partir de 56 rem */}
              <ul className="@4xl:hidden divide-y divide-border mt-3 border-t border-border">
                {view.items.map(e => <FiscalEventCard key={e.eventId} e={e} />)}
              </ul>
              <div className="hidden @4xl:block overflow-x-auto mt-3">
                <table className="w-full text-xs">
                  <thead>
                    <tr className={tableHeadRowClasses()}>
                      <th className="text-left px-4 py-2.5">
                        <button type="button" onClick={() => toggleSort('fecha')} className="flex items-center gap-1 hover:text-fg">
                          Fecha <SortIcon col="fecha" activeCol={sortKey} dir={sortDir} />
                        </button>
                      </th>
                      <th className="text-left px-4 py-2.5">Tipo</th>
                      <th className="text-left px-4 py-2.5">
                        <button type="button" onClick={() => toggleSort('activoTransmitido')} className="flex items-center gap-1 hover:text-fg">
                          Operación <SortIcon col="activoTransmitido" activeCol={sortKey} dir={sortDir} />
                        </button>
                      </th>
                      <th className="text-right px-4 py-2.5">Cantidad</th>
                      <th className="text-center px-3 py-2.5" title="Clave de la contrapartida en el modelo de la AEAT">Clave</th>
                      <th className="text-right px-4 py-2.5" title="Valor de transmisión y gastos de la venta">
                        <button type="button" onClick={() => toggleSort('valorTransmisionEur')} className="flex items-center gap-1 hover:text-fg ml-auto">
                          Transmisión <SortIcon col="valorTransmisionEur" activeCol={sortKey} dir={sortDir} />
                        </button>
                      </th>
                      <th className="text-right px-4 py-2.5" title="Valor de adquisición y gastos de la compra">Adquisición</th>
                      <th className="text-right px-4 py-2.5">
                        <button type="button" onClick={() => toggleSort('gananciaPerdidaEur')} className="flex items-center gap-1 hover:text-fg ml-auto">
                          G/P € <SortIcon col="gananciaPerdidaEur" activeCol={sortKey} dir={sortDir} />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {view.items.map(e => <FiscalEventRow key={e.eventId} e={e} />)}
                  </tbody>
                  <tfoot>
                    <tr className={tableFootRowClasses()}>
                      <td className="px-4 py-2.5 text-xs text-fg-subtle" colSpan={5}>
                        {isPartial ? `Total de ${filtered.length} de ${events.length} operaciones` : `Total de ${filtered.length} operaciones`}
                      </td>
                      <td className="px-4 py-2.5 text-right mono text-xs whitespace-nowrap">
                        {formatEur(totales.valorTransmision)}
                        <div className="text-[11px] text-fg-subtle">− {formatEur(totales.gastosTransmision)} gastos</div>
                      </td>
                      <td className="px-4 py-2.5 text-right mono text-xs whitespace-nowrap">
                        {formatEur(totales.valorAdquisicion)}
                        <div className="text-[11px] text-fg-subtle">+ {formatEur(totales.gastosAdquisicion)} gastos</div>
                      </td>
                      <td className={`px-4 py-2.5 text-right mono font-bold ${pnlColor(totales.gananciaPerdida)}`}>
                        {totales.gananciaPerdida >= 0 ? '+' : ''}{formatEur(totales.gananciaPerdida)}
                        {isPartial && (
                          <div className="text-xs text-fg-subtle font-normal">
                            neto del año: {summary.netoPatrimonial >= 0 ? '+' : ''}{formatEur(summary.netoPatrimonial)}
                          </div>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {/* Total de lo filtrado también en móvil */}
              <p className={`@4xl:hidden px-4 py-2 border-t border-border text-xs flex justify-between ${pnlColor(totales.gananciaPerdida)}`}>
                <span className="text-fg-subtle">Total de {filtered.length} operaciones</span>
                <span className="mono font-bold">{totales.gananciaPerdida >= 0 ? '+' : ''}{formatEur(totales.gananciaPerdida)}</span>
              </p>
              <Pagination label="operaciones" page={view.page} pages={view.pages} from={view.from} to={view.to} total={view.total}
                size={size} onSize={setSize} onPage={p => setPageState({ key: viewKey, page: p })} />
              {warnings > 0 && <WarningsLegend />}
            </>
          )}
        </>
      )}
    </div>
  )
}
