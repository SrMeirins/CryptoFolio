import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, ArrowUpDown, TrendingUp, Download } from 'lucide-react'
import { formatEur, formatEurSigned, formatNumber, pnlColor } from '../../utils/format'
import { TableExpandToggle } from './TableExpandToggle'
import { OperacionesFilters } from './OperacionesFilters'
import { WarningsLegend } from './EventWarnings'
import type { FiscalEvent, FiscalSummary } from './types'
import { buttonClasses, FilteredEmpty, Hint, MultiDropdown, Pagination, panelSurface, SegmentedControl, StatStrip, Switch, tableFootRowClasses, tableHeadRowClasses, Tooltip } from '../../components/ui'
import { useDebounce } from '../../hooks/useDebounce'
import { usePrivacyStore } from '../../store/privacyStore'
import { paginate, type PageSize } from '../../utils/pagination'
import { buildEventsCsv, EMPTY_FILTERS, filterEvents, hasWarning, isFiltered, necesitaRevision, sortEvents, toneCounts, type EventFilters, type SortDir, type SortKey } from '../../utils/fiscalOperations'
import { agruparOperaciones, filasTabla, hayGastos, resumenTabla, sinEfecto } from '../../utils/operacionesTabla'
import { FilaOperacion } from './operaciones/FilaOperacion'
import { FilaMicro } from './operaciones/FilaMicro'
import { TarjetaOperacion } from './operaciones/TarjetaOperacion'
import { columnasExtra, columnasVisibles, COLUMNAS_OPCIONALES, useTablaPreferencias, type ColumnaOpcional, type Densidad } from './operaciones/preferencias'

// Tabla de ganancias y pérdidas patrimoniales (#299, #543): una fila por
// operación con sus lotes FIFO desplegables; las sin efecto fiscal, ocultas
// salvo que se pidan; las microoperaciones del mismo día y activo, agrupadas.
// Tira pulsable con ganancias, pérdidas y diferidas por recompra; filtros,
// columnas y densidad (que se recuerdan), paginación, tarjetas en móvil y CSV.

const DENSIDADES = [
  { value: 'comoda' as const, label: 'Cómoda' },
  { value: 'compacta' as const, label: 'Compacta' },
]

function Cabecera({ col, label, sortKey, sortDir, onSort, align = 'left', className = '', ayuda }: {
  col: SortKey; label: string; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void; align?: 'left' | 'right'; className?: string
  /** Qué incluye la columna, en una ayuda junto al título. */
  ayuda?: string
}) {
  const activa = sortKey === col
  const Icon = !activa ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th scope="col" aria-sort={activa ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`${align === 'right' ? 'text-right' : 'text-left'} font-medium py-2.5 ${className}`}>
      <span className={`inline-flex items-center gap-0.5 ${align === 'right' ? 'justify-end w-full' : ''}`}>
        <button type="button" onClick={() => onSort(col)}
          className="inline-flex items-center hover:text-fg transition-colors rounded focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60">
          {label}
          <Icon size={10} aria-hidden="true" className={`ml-1 ${activa ? 'text-brand' : 'text-fg-subtle'}`} />
        </button>
        {ayuda && <Tooltip label={label} triggerLabel={`Qué incluye ${label}`}><p>{ayuda}</p></Tooltip>}
      </span>
    </th>
  )
}

export function TablaEventos({ events, summary, initialFilters }: {
  events: FiscalEvent[]
  summary: FiscalSummary
  /** Filtros con los que se abre la tabla, p. ej. desde un gráfico (#301). */
  initialFilters?: Partial<EventFilters>
}) {
  const uid = useId()
  const [expanded, setExpanded] = useState(true)
  const [filtersState, setFilters] = useState<EventFilters>(() => ({ ...EMPTY_FILTERS, ...initialFilters }))
  const [searchInput, setSearchInput] = useState('')
  const search = useDebounce(searchInput, 200)
  const [sortKey, setSortKey] = useState<SortKey>('fecha')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [size, setSize] = useState<PageSize>(25)
  const [verSinEfecto, setVerSinEfecto] = useState(false)
  const prefs = useTablaPreferencias()
  const privacy = usePrivacyStore(s => s.hidden)

  // Una fila por operación (#543); las sin efecto fiscal, solo si se piden.
  const operaciones = useMemo(() => agruparOperaciones(events), [events])
  const nSinEfecto = useMemo(() => operaciones.filter(sinEfecto).length, [operaciones])
  const base = useMemo(() => (verSinEfecto ? operaciones : operaciones.filter(o => !sinEfecto(o))), [operaciones, verSinEfecto])
  // Comisiones de red de traspasos en el ejercicio: se enlaza su criterio en Ajustes.
  const hayComisionRed = useMemo(() => events.some(e => e.tipo === 'WITHDRAW' || e.tipo === 'TRANSFER_INTERNAL'), [events])

  const filters = useMemo(() => ({ ...filtersState, search }), [filtersState, search])
  // Cualquier cambio de filtro, orden, tamaño o vista vuelve a la página 1, sin efectos encadenados.
  const viewKey = JSON.stringify([filters, sortKey, sortDir, size, events.length, verSinEfecto])
  const [pageState, setPageState] = useState({ key: viewKey, page: 1 })
  const page = pageState.key === viewKey ? pageState.page : 1

  const assets = useMemo(() => {
    const set = new Set<string>()
    base.forEach(e => { set.add(e.activoTransmitido); if (e.activoRecibido) set.add(e.activoRecibido) })
    return [...set].sort()
  }, [base])
  const tones = useMemo(() => toneCounts(base), [base])
  const warnings = useMemo(() => base.filter(hasWarning).length, [base])
  const porRevisar = useMemo(() => base.filter(necesitaRevision).length, [base])

  const filtered = useMemo(() => sortEvents(filterEvents(base, filters), sortKey, sortDir), [base, filters, sortKey, sortDir])
  const filas = useMemo(() => filasTabla(filtered), [filtered])
  const view = paginate(filas, page, size)
  const resumen = useMemo(() => resumenTabla(filtered), [filtered])
  // Columnas visibles (#543): las elegidas y, las de gastos, solo si hay alguno de ese tipo.
  const columnas = useMemo(() => columnasVisibles(prefs.columnas, hayGastos(filtered)), [prefs.columnas, filtered])
  const ver = (c: ColumnaOpcional) => columnas.has(c)

  const totales = useMemo(() => filtered.reduce((acc, e) => ({
    valorTransmision: acc.valorTransmision + e.valorTransmisionEur,
    gastosTransmision: acc.gastosTransmision + e.gastosTransmisionEur,
    valorAdquisicion: acc.valorAdquisicion + e.valorAdquisicionEur,
    gastosAdquisicion: acc.gastosAdquisicion + e.gastosAdquisicionEur,
  }), { valorTransmision: 0, gastosTransmision: 0, valorAdquisicion: 0, gastosAdquisicion: 0 }), [filtered])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }
  const patch = (p: Partial<EventFilters>) => setFilters(f => ({ ...f, ...p }))
  const clear = () => { setFilters(EMPTY_FILTERS); setSearchInput('') }

  // CSV: los lotes de las operaciones que se ven (una línea por lote, como la casilla 1800).
  function exportCsv() {
    const blob = new Blob(['﻿' + buildEventsCsv(filtered.flatMap(o => o.lotes))], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `operaciones_fiscal_${summary.year}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const isPartial = filtered.length < base.length
  // La columna Tipo va dentro de la del par (#543): no suma columnas.
  const nCols = 4 + columnasExtra(columnas)
  // Columnas que preceden a Transmisión en el pie: Fecha, Par y las opcionales Cantidad y Clave.
  const colsAntes = 2 + (['cantidad', 'clave'] as const).filter(ver).length

  return (
    // @container: tabla o tarjetas según el ancho de la tarjeta, no de la ventana (con la barra lateral, 1024 px no bastan).
    <div className={panelSurface('none', 'overflow-hidden @container')}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-wrap gap-2">
        <TableExpandToggle icon={TrendingUp} title="Ganancias y pérdidas patrimoniales" count={base.length}
          expanded={expanded} onToggle={() => setExpanded(!expanded)} />
        {expanded && (
          <Hint label={privacy ? 'Desactiva el modo privacidad para exportar' : 'Exportar a CSV los lotes de las operaciones que se ven'}>
            <button type="button" onClick={exportCsv} disabled={privacy || filtered.length === 0} className={buttonClasses('secondary', 'sm', 'flex gap-1')}>
              <Download size={11} aria-hidden="true" /> {isPartial ? 'CSV de lo filtrado' : 'CSV de operaciones'}
            </button>
          </Hint>
        )}
      </div>

      {expanded && (
        <>
          {/* Tira pulsable (#543): cada celda filtra la tabla. */}
          <div className="px-4 pt-4 space-y-1.5">
            <StatStrip label="Resumen de las operaciones que se ven" cells={[
              { key: 'ganancias', label: 'Ganancias', value: resumen.ganancias, format: formatEurSigned, tone: resumen.ganancias > 0.005 ? 'positive' : undefined,
                onSelect: () => patch({ result: filtersState.result === 'gain' ? 'all' : 'gain' }), destination: 'la tabla' },
              { key: 'perdidas', label: 'Pérdidas', value: resumen.perdidas, format: formatEurSigned, tone: resumen.perdidas < -0.005 ? 'negative' : undefined,
                onSelect: () => patch({ result: filtersState.result === 'loss' ? 'all' : 'loss' }), destination: 'la tabla' },
              { key: 'diferidas', label: 'Diferidas por recompra', value: resumen.diferidas, format: formatEurSigned,
                sub: `${formatNumber(resumen.nDiferidas, 0)} ${resumen.nDiferidas === 1 ? 'operación' : 'operaciones'}`,
                tone: resumen.nDiferidas > 0 ? 'warning' : undefined,
                ...(resumen.nDiferidas > 0 && { onSelect: () => patch({ onlyRecompra: !filtersState.onlyRecompra }), destination: 'la tabla' }) },
            ]} />
            <p className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-fg-subtle">
              {/* Qué no está aquí y por qué (#543): solo se declaran las transmisiones. */}
              <span>
                Solo transmisiones: las compras con euros, los depósitos y los traspasos no se declaran, están en{' '}
                <Link to="/history" className="text-brand-ink hover:underline rounded focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">Historial</Link>.
                {hayComisionRed && <>{' '}La comisión de red de tus traspasos sí cuenta; su criterio está en{' '}
                  <Link to="/settings?tab=fiscal" className="text-brand-ink hover:underline rounded focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">Ajustes</Link>.</>}
              </span>
              <span className="inline-flex items-center gap-1">¿Qué son las diferidas?
                <Tooltip label="Pérdidas diferidas por recompra (art. 33.5 LIRPF)">
                  <p>Si vendes con pérdida y compras el mismo activo en los 2 meses anteriores o posteriores, la pérdida no se integra hasta que vendas esa recompra.</p>
                  <p className="mt-1.5 text-fg-subtle">Su aplicación a criptoactivos no es pacífica. Con stablecoins que compras a menudo (USDC, USDT) casi cualquier pérdida queda marcada. Consúltalo con tu asesor.</p>
                </Tooltip>
              </span>
            </p>
          </div>
          <OperacionesFilters filters={filtersState} search={searchInput} onSearch={setSearchInput} onChange={patch}
            tones={tones} warnings={warnings} porRevisar={porRevisar} assets={assets} onClear={clear} filtered={isFiltered(filters)} />
          {/* Vista: sin efecto fiscal, columnas y densidad (#543). */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3">
            <span className="inline-flex items-center gap-2 text-xs text-fg-muted">
              <Switch id={`${uid}-sin-efecto`} checked={verSinEfecto} onChange={setVerSinEfecto} disabled={nSinEfecto === 0} />
              <label htmlFor={`${uid}-sin-efecto`} className="cursor-pointer">
                Ver las de resultado cero <span className="mono text-fg-subtle">{nSinEfecto}</span>
              </label>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <MultiDropdown size="sm" label="Columnas de la tabla" placeholder="Sin columnas opcionales" plural="columnas" align="end"
                values={prefs.columnas} options={COLUMNAS_OPCIONALES} onChange={prefs.setColumnas} />
              <SegmentedControl options={DENSIDADES} value={prefs.densidad} onChange={(v: Densidad) => prefs.setDensidad(v)} label="Densidad de la tabla" size="sm" />
            </span>
          </div>

          {filtered.length === 0 ? (
            <FilteredEmpty onClear={clear} />
          ) : (
            <>
              {/* Tarjetas en contenedores estrechos; tabla a partir de 56 rem */}
              <ul className="@4xl:hidden divide-y divide-border mt-3 border-t border-border">
                {view.items.map(f => <TarjetaOperacion key={f.tipo === 'micro' ? f.grupo.clave : f.op.txId} fila={f} />)}
              </ul>
              <div className="hidden @4xl:block relative overflow-x-auto mt-3">
                <table className="w-full text-sm">
                  <caption className="sr-only">Operaciones con ganancia o pérdida patrimonial de {summary.year}</caption>
                  <thead>
                    <tr className={tableHeadRowClasses()}>
                      <Cabecera col="fecha" label="Fecha" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="pl-4 pr-1.5" />
                      <Cabecera col="activoTransmitido" label="Par" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-2.5"
                        ayuda="Canal de cada permuta: en una orden de mercado, Binance cobra la comisión aparte y se muestra su importe exacto; en Convert y en saldos a BNB va dentro del tipo de cambio y Binance no la desglosa. La comisión de una compra se suma al coste de lo recibido y se deduce como gasto de adquisición al venderlo." />
                      {ver('cantidad') && <th scope="col" className="text-right font-medium px-2.5 py-2.5">Cantidad</th>}
                      {ver('clave') && <th scope="col" className="text-center font-medium px-2.5 py-2.5">Clave 1800</th>}
                      {ver('transmision') && <Cabecera col="valorTransmisionEur" label="Transmisión" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" className="px-2.5"
                        ayuda="Valor de transmisión: lo que recibiste por la venta o el valor de mercado en la permuta, antes de restar los gastos de la venta." />}
                      {ver('gastosTransmision') && (
                        <th scope="col" className="text-right font-medium px-2.5 py-2.5">
                          <span className="inline-flex items-center justify-end gap-0.5 w-full"><span>Gastos de<br />transmisión</span>
                            <Tooltip label="Gastos de transmisión" triggerLabel="Qué incluye Gastos de transmisión"><p>Comisión de la venta, en la parte de cada lote. Se resta del valor de transmisión.</p></Tooltip>
                          </span>
                        </th>
                      )}
                      {ver('adquisicion') && (
                        <th scope="col" className="text-right font-medium px-2.5 py-2.5">
                          <span className="inline-flex items-center justify-end gap-0.5 w-full">Adquisición
                            <Tooltip label="Adquisición" triggerLabel="Qué incluye Adquisición"><p>Valor de adquisición: lo que costaron los lotes consumidos según el FIFO, sin la comisión de compra, que va en Gastos de adquisición.</p></Tooltip>
                          </span>
                        </th>
                      )}
                      {ver('gastosAdquisicion') && (
                        <th scope="col" className="text-right font-medium px-2.5 py-2.5">
                          <span className="inline-flex items-center justify-end gap-0.5 w-full"><span>Gastos de<br />adquisición</span>
                            <Tooltip label="Gastos de adquisición" triggerLabel="Qué incluye Gastos de adquisición"><p>Comisión de compra de los lotes consumidos, en su parte proporcional. Se suma al valor de adquisición. Resultado = transmisión - gastos de transmisión - adquisición - gastos de adquisición, como en la Renta.</p></Tooltip>
                          </span>
                        </th>
                      )}
                      <Cabecera col="gananciaPerdidaEur" label="Resultado" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" className="px-2.5" />
                      {ver('renta') && <th scope="col" className="text-center font-medium px-1.5 py-2.5">Renta</th>}
                      <th scope="col" className="pr-2"><span className="sr-only">Detalle</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {view.items.map(f => f.tipo === 'micro'
                      ? <FilaMicro key={f.grupo.clave} grupo={f.grupo} columnas={columnas} densidad={prefs.densidad} />
                      : <FilaOperacion key={f.op.txId} op={f.op} columnas={columnas} densidad={prefs.densidad} />)}
                  </tbody>
                  <tfoot>
                    <tr className={tableFootRowClasses()}>
                      <td className="px-4 py-2.5 text-xs text-fg-subtle" colSpan={colsAntes}>
                        {isPartial ? `Total de ${filtered.length} de ${base.length} operaciones` : `Total de ${filtered.length} operaciones`}
                      </td>
                      {ver('transmision') && <td className="px-2.5 py-2.5 text-right mono text-xs whitespace-nowrap">{formatEur(totales.valorTransmision)}</td>}
                      {ver('gastosTransmision') && <td className="px-2.5 py-2.5 text-right mono text-xs whitespace-nowrap">{formatEur(totales.gastosTransmision)}</td>}
                      {ver('adquisicion') && <td className="px-2.5 py-2.5 text-right mono text-xs whitespace-nowrap">{formatEur(totales.valorAdquisicion)}</td>}
                      {ver('gastosAdquisicion') && <td className="px-2.5 py-2.5 text-right mono text-xs whitespace-nowrap">{formatEur(totales.gastosAdquisicion)}</td>}
                      <td className={`px-2.5 py-2.5 text-right mono font-bold whitespace-nowrap ${pnlColor(resumen.neto)}`}>
                        {formatEurSigned(resumen.neto)}
                        {isPartial && <div className="text-xs text-fg-subtle font-normal">neto del año: {formatEurSigned(summary.netoPatrimonial)}</div>}
                      </td>
                      <td colSpan={nCols - colsAntes - (['transmision', 'gastosTransmision', 'adquisicion', 'gastosAdquisicion'] as const).filter(ver).length - 1} />
                    </tr>
                  </tfoot>
                </table>
              </div>
              {/* Total de lo filtrado también en móvil */}
              <p className={`@4xl:hidden px-4 py-2 border-t border-border text-xs flex justify-between ${pnlColor(resumen.neto)}`}>
                <span className="text-fg-subtle">Total de {filtered.length} operaciones</span>
                <span className="mono font-bold">{formatEurSigned(resumen.neto)}</span>
              </p>
              <Pagination label="filas" page={view.page} pages={view.pages} from={view.from} to={view.to} total={view.total}
                size={size} onSize={setSize} onPage={p => setPageState({ key: viewKey, page: p })} />
              {warnings > 0 && <WarningsLegend />}
            </>
          )}
        </>
      )}
    </div>
  )
}
