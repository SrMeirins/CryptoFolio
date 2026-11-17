import { useState, useMemo, useRef, type ReactNode, type KeyboardEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpDown, Download } from 'lucide-react'
import { portfolioApi } from '../api/portfolio'
import { pricesApi } from '../api/prices'
import { useFlipRows } from '../hooks/useFlipRows'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { usePrivacyStore } from '../store/privacyStore'
import { formatMoney, pnlColor } from '../utils/format'
import { buildPositionsCsv, nextRowIndex, sparkSeries, tableTotals } from '../utils/portfolioTable'
import { columnasVisibles, valueIndex, type ColumnDef } from '../utils/portfolioColumns'
import { listaY } from '../utils/listaY'
import { columnTotals, metricsByAsset, realizadoPorActivo } from '../utils/positionMetrics'
import { usePortfolioColumnas } from '../hooks/usePortfolioColumnas'
import { MEDIUM_QUERY, useMediaQuery } from '../hooks/useMediaQuery'
import { useColumnasQueCaben } from '../hooks/useColumnasQueCaben'
import { useNavStore } from '../store/navStore'
import { SignedMoney } from './AssetTableMetricCells'
import { PositionCards } from './PositionCards'
import { PnlPill, WeightCell } from './AssetTableCells'
import { useDisplayMarket } from '../hooks/useDisplayMarket'
import { usePricesStore } from '../store/pricesStore'
import { sortRows, nextSort, type UnifiedRow, type SortKey, type SortDir } from '../utils/assetTable'
import { CryptoRowComponent } from './AssetTableCryptoRow'
import { FiatRowComponent } from './AssetTableFiatRow'
import { SortTh } from './AssetTableSortTh'
import { buttonClasses, tableFootRowClasses, tableHeadRowClasses, Hint, Tooltip, QueryError } from './ui'

interface AssetTableProps {
  /** Filas ya calculadas por la página (ver utils/portfolioSections.ts). */
  rows: UnifiedRow[]
  /** Valor de toda la cartera: base del «% cartera» (global, no de esta tabla). */
  portfolioTotal: number
  compact?: boolean
  /** Oculta el chip de wallet en cada fila (la tabla ya es de una sola wallet). */
  hideWalletChips?: boolean
  /** Distingue filas del mismo activo en tablas que mezclan wallets (polvo). */
  keyByWallet?: boolean
  onSimulate?: (asset: string, qty: number, price: number) => void
  /** Abre el panel de detalle de un activo (#272). */
  /** Abre el detalle; con el orden de activos de la tabla para navegar con [ y ] (#528). */
  onOpen?: (asset: string, order: readonly string[]) => void
  /** Contenido de la barra superior, a la izquierda del botón de restablecer orden. */
  header?: ReactNode
  /** Muestra el botón de exportar a CSV con este prefijo de fichero (#282). */
  exportName?: string
  /**
   * Tabla con parte de cada activo (una wallet, el polvo o un filtro de wallet):
   * sin las columnas que dependen del activo entero (resultado total, ingresos) (#527).
   */
  parcial?: boolean
}

/** Por debajo de 640 px, tarjetas con lo esencial en lugar de la tabla (#527). */
const MOVIL_QUERY = '(max-width: 639px)'

// Tabla de posiciones de Portfolio (#269): solo presentación y orden. Antes
// calculaba sus propias filas, su polvo y su total, con lo que cada wallet
// tenía su bloque de polvo y el «% cartera» era relativo a la propia tabla.
export function AssetTable({ rows, portfolioTotal, compact = false, hideWalletChips = false, keyByWallet = false, onSimulate, onOpen, header, exportName, parcial = false }: AssetTableProps) {
  // Precios en vivo y de hace 24h (WebSocket, #147) en la moneda de visualización (#177).
  const { currency, rate, prices, open24: yesterdayPrices } = useDisplayMarket()
  const rawPrices = usePricesStore(s => s.prices)
  const privacy = usePrivacyStore(s => s.hidden)
  const reduceMotion = useReducedMotion()
  const tbodyRef = useRef<HTMLTableSectionElement>(null)
  // El simulador de venta es fiscal y trabaja siempre en EUR: recibe el precio
  // en EUR del store en el momento del clic, sea cual sea la moneda mostrada.
  const simulate = onSimulate
    ? (asset: string, qty: number) => onSimulate(asset, qty, usePricesStore.getState().prices[asset] ?? 0)
    : undefined
  const { data: lockedAmounts = [] } = useQuery({
    queryKey: ['locked-amounts'],
    queryFn: portfolioApi.getLockedAmounts,
    staleTime: 60_000,
  })
  const [sortKey, setSortKey] = useState<SortKey>('value')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Se calcula a partir del estado actual (no dentro de un updater): los
  // updaters deben ser puros y StrictMode los ejecuta dos veces en desarrollo.
  function handleSort(key: SortKey) {
    const next = nextSort(key, sortKey, sortDir)
    setSortKey(next.key)
    setSortDir(next.dir)
  }


  // Cierres de 7 días de todos los activos de la tabla en una sola petición (#282).
  const cryptoAssets = useMemo(
    () => [...new Set(rows.filter(r => r.kind === 'crypto').map(r => r.asset))].sort(),
    [rows],
  )
  // Columnas elegidas (#527); las que dependen del activo entero no van en tablas parciales.
  const { columnas } = usePortfolioColumnas()
  const elegidas = useMemo(() => columnasVisibles(columnas, { compact, parcial }), [columnas, compact, parcial])
  const showQty = columnas.includes('cantidad')
  const movil = useMediaQuery(MOVIL_QUERY)
  // Las que no caben en el panel se ocultan por prioridad, con aviso (#527).
  const { visibles: columns, ocultas, panelRef, tablaRef } = useColumnasQueCaben(
    elegidas, `${elegidas.map(c => c.key).join(',')}|${showQty}|${rows.length}|${movil}|${currency}`)
  const has = (k: ColumnDef['key']) => elegidas.some(c => c.key === k)
  const menuPlegado = useNavStore(s => s.collapsed)
  const plegarMenu = useNavStore(s => s.setCollapsed)
  const menuForzado = useMediaQuery(MEDIUM_QUERY)

  // Con «Desde máx. 90 d», una sola petición de 90 días sirve también a la tendencia.
  const closeDays = has('maximo90') ? 90 : 7
  const closesQ = useQuery({
    queryKey: ['price-closes', closeDays, cryptoAssets.join(',')],
    queryFn: () => pricesApi.getCloses(cryptoAssets, closeDays),
    enabled: cryptoAssets.length > 0 && (has('tendencia') || has('maximo90')),
    staleTime: 10 * 60_000,
  })
  const { data: closes } = closesQ
  const spark = (asset: string) => {
    const series = closes?.closes[asset]?.slice(-7)
    return series && rate !== null ? sparkSeries(series, rawPrices[asset], rate) : undefined
  }
  const realizedQ = useQuery({
    queryKey: ['realized-by-asset'],
    queryFn: portfolioApi.getRealizedByAsset,
    enabled: has('resultado'),
    staleTime: 60_000,
  })
  const incomeQ = useQuery({
    queryKey: ['income-by-asset'],
    queryFn: portfolioApi.getIncomeByAsset,
    enabled: has('ingresos'),
    staleTime: 60_000,
  })
  const metrics = useMemo(() => metricsByAsset(rows, {
    prices, pricesEur: rawPrices, rate,
    realizadoEur: realizedQ.data && realizadoPorActivo(realizedQ.data),
    ingresosEur: incomeQ.data && new Map(incomeQ.data.map(r => [r.asset, { total: r.total_eur, operations: r.operations }])),
    cierres90: closeDays === 90 ? closes?.closes : undefined,
  }), [rows, prices, rawPrices, rate, realizedQ.data, incomeQ.data, closes, closeDays])
  const colTotals = useMemo(() => columnTotals(rows, metrics), [rows, metrics])

  const sorted = useMemo(
    () => sortRows(rows, sortKey, sortDir, prices, portfolioTotal, metrics),
    [rows, sortKey, sortDir, prices, portfolioTotal, metrics],
  )
  const defaultOrder = sortKey === 'value' && sortDir === 'desc'
  // El detalle recibe el orden visible de la tabla (#528).
  const openDetail = useMemo(() => {
    if (!onOpen) return undefined
    const order = sorted.filter(r => r.kind === 'crypto').map(r => r.asset)
    return (asset: string) => onOpen(asset, order)
  }, [onOpen, sorted])
  const totals = useMemo(() => tableTotals(rows, prices, portfolioTotal), [rows, prices, portfolioTotal])

  // Solo se anima la reordenación provocada por el usuario: orden o conjunto de filas.
  useFlipRows(tbodyRef, `${sortKey}|${sortDir}|${cryptoAssets.join(',')}|${rows.length}`, reduceMotion)

  // ↑↓/Inicio/Fin entre filas, «s» simula la venta (#282); Intro abre el detalle (botón nativo).
  function handleKeyDown(e: KeyboardEvent<HTMLTableSectionElement>) {
    const target = e.target as HTMLElement
    if (!target.hasAttribute('data-row-nav') || e.altKey || e.ctrlKey || e.metaKey) return
    const navs = Array.from(tbodyRef.current?.querySelectorAll<HTMLElement>('[data-row-nav]') ?? [])
    const next = nextRowIndex(e.key, navs.indexOf(target), navs.length)
    if (next !== null) {
      e.preventDefault()
      navs[next]?.focus()
    } else if (e.key.toLowerCase() === 's' && simulate) {
      const row = sorted.find(r => r.kind === 'crypto' && r.asset === target.dataset.asset)
      if (row?.kind === 'crypto') { e.preventDefault(); simulate(row.asset, row.totalQuantity) }
    }
  }

  function exportCsv() {
    const csv = buildPositionsCsv(sorted, prices, portfolioTotal, currency)
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${exportName ?? 'posiciones'}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const sortProps = { sortKey, sortDir, onSort: handleSort }
  // «Valor» se intercala tras cantidad, precio y tendencia.
  const valueAt = valueIndex(columns)
  const withValue = (cells: ReactNode[], value: ReactNode) => [...cells.slice(0, valueAt), value, ...cells.slice(valueAt)]
  const rowKey = (row: UnifiedRow) => `${row.kind}-${row.asset}-${keyByWallet ? row.wallets[0]?.wallet_id ?? '' : ''}-${currency}`

  return (
    <div>
      {(header || !defaultOrder || exportName) && (
        <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">{header}</div>
          <div className="flex items-center gap-2">
            {!defaultOrder && (
              <Hint label="Restablecer el orden por valor">
                <button type="button" onClick={() => { setSortKey('value'); setSortDir('desc') }}
                  className={buttonClasses('secondary', 'sm', 'flex gap-1')}>
                  <ArrowUpDown size={10} aria-hidden="true" /> Orden por valor
                </button>
              </Hint>
            )}
            {exportName && (
              // En modo privacidad no se exportan importes.
              <Hint label={privacy ? 'Desactiva el modo privacidad para exportar' : 'Exportar las posiciones visibles a CSV'}>
                <button type="button" onClick={exportCsv} disabled={privacy || sorted.length === 0}
                  className={buttonClasses('secondary', 'sm', 'flex gap-1')}
  >
                  <Download size={11} aria-hidden="true" /> CSV
                </button>
              </Hint>
            )}
          </div>
        </div>
      )}
      {/* Cabecera fija al desplazarse (#271): sin contenedor de scroll propio en
          pantallas anchas; en estrechas, desplazamiento horizontal. */}
      {closesQ.isError && (
        <QueryError what={closeDays === 90 ? 'los cierres de 90 días' : 'la tendencia de 7 días'} error={closesQ.error} onRetry={() => void closesQ.refetch()} className="py-4 border-b border-border" />
      )}
      {realizedQ.isError && (
        <QueryError what="el P&L realizado del resultado total" error={realizedQ.error} onRetry={() => void realizedQ.refetch()} className="py-4 border-b border-border" />
      )}
      {incomeQ.isError && (
        <QueryError what="los ingresos por activo" error={incomeQ.error} onRetry={() => void incomeQ.refetch()} className="py-4 border-b border-border" />
      )}
      {movil ? (
        <PositionCards rows={sorted} prices={prices} metrics={metrics} onOpen={openDetail} keyOf={rowKey} />
      ) : (<>
      {ocultas.length > 0 && (
        <p role="status" className="px-4 py-2 border-b border-border bg-overlay/3 text-xs text-fg-muted flex items-center gap-2 flex-wrap">
          <span>
            {ocultas.length === 1 ? 'No cabe la columna' : `No caben ${ocultas.length} columnas:`} {listaY(ocultas.map(c => c.label))}.
            {' '}{!menuPlegado && !menuForzado ? 'Pliega el menú o amplía la ventana para verlas.' : 'Amplía la ventana para verlas.'}
          </span>
          {!menuPlegado && !menuForzado && (
            <button type="button" onClick={() => plegarMenu(true)} className={buttonClasses('secondary', 'sm')}>Plegar el menú</button>
          )}
        </p>
      )}
      {/* overflow-x-clip: recorta sin crear contenedor de scroll, así la cabecera sigue fija (#271). */}
      <div ref={panelRef} className="overflow-x-clip">
        <table ref={tablaRef} className="w-full text-sm tabular-nums">
          <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-background-card [&_th]:shadow-[inset_0_-1px_0_var(--cf-border)]">
            <tr className={tableHeadRowClasses()}>
              <SortTh {...sortProps} label="Activo" sk="asset" right={false} className="pl-4 pr-2.5" />
              {withValue(columns.map(c => c.sort
                ? <SortTh key={c.key} {...sortProps} label={c.label} sk={c.sort} title={c.hint} />
                : <th key={c.key} scope="col" className="px-2.5 py-2.5 text-right whitespace-nowrap"><span className="inline-flex items-center gap-1">{c.label} <Tooltip label="Tendencia" triggerLabel={`Qué es ${c.label}`}><p>{c.hint}</p></Tooltip></span></th>),
                <SortTh key="valor" {...sortProps} label="Valor" sk="value" title={`Valor en ${currency}`} />)}
            </tr>
          </thead>
          <tbody ref={tbodyRef} className="divide-y divide-border" onKeyDown={handleKeyDown}>
            {sorted.map(row => row.kind === 'fiat'
              ? <FiatRowComponent key={rowKey(row)} rowKey={rowKey(row)} row={row} columns={columns} showQty={showQty} totalPortfolioValue={portfolioTotal} compact={compact} />
              : <CryptoRowComponent key={rowKey(row)} rowKey={rowKey(row)} spark={spark(row.asset)} row={row} columns={columns} showQty={showQty} metrics={metrics.get(row.asset)}
                  prices={prices} yesterdayPrices={yesterdayPrices}
                  totalPortfolioValue={portfolioTotal} compact={compact} onSimulate={simulate} hideWalletChips={hideWalletChips} onOpen={openDetail}
                  lockedAmounts={lockedAmounts.filter(l => l.asset === row.asset && row.wallets.some(w => w.wallet_id === l.wallet_id))} />)}
          </tbody>
          {/* Totales de las filas visibles (#282) */}
          {sorted.length > 1 && (
            <tfoot>
              <tr className={tableFootRowClasses('text-sm')}>
                <th scope="row" className="pl-4 pr-2.5 py-3 text-left font-semibold text-fg">Total</th>
                {withValue(columns.map(c => {
                  const foot = (content: ReactNode) => <td key={c.key} className="px-2.5 py-3 text-right mono whitespace-nowrap">{content}</td>
                  switch (c.key) {
                    case 'coste': return foot(colTotals.coste > 0 && <span className="text-fg-muted">{formatMoney(colTotals.coste, currency)}</span>)
                    case 'pnl': return foot(totals.pnlPct !== null && (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className={`font-medium ${pnlColor(totals.pnl)}`}>{totals.pnl >= 0 ? '+' : ''}{formatMoney(totals.pnl, currency)}</span>
                        <PnlPill pct={totals.pnlPct} />
                      </div>
                    ))
                    case 'resultado': return foot(colTotals.resultado !== null && <SignedMoney value={colTotals.resultado} currency={currency} className="font-medium" />)
                    case 'ingresos': return foot(colTotals.ingresos !== null && <span className="text-fg">{formatMoney(colTotals.ingresos, currency)}</span>)
                    case 'peso': return <td key={c.key} className="px-2.5 py-3"><WeightCell pct={totals.weightPct} /></td>
                    default: return <td key={c.key} />
                  }
                }), <td key="valor" className="px-2.5 py-3 text-right mono font-semibold text-fg whitespace-nowrap">{formatMoney(totals.value, currency)}</td>)}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      </>)}
    </div>
  )
}
