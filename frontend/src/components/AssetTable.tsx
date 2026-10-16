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
import { PnlPill, WeightCell } from './AssetTableCells'
import { useDisplayMarket } from '../hooks/useDisplayMarket'
import { usePricesStore } from '../store/pricesStore'
import { sortRows, nextSort, type UnifiedRow, type SortKey, type SortDir } from '../utils/assetTable'
import { CryptoRowComponent } from './AssetTableCryptoRow'
import { FiatRowComponent } from './AssetTableFiatRow'
import { SortTh } from './AssetTableSortTh'
import { buttonClasses, tableFootRowClasses, tableHeadRowClasses } from './ui'

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
  onOpen?: (asset: string) => void
  /** Contenido de la barra superior, a la izquierda del botón de restablecer orden. */
  header?: ReactNode
  /** Muestra el botón de exportar a CSV con este prefijo de fichero (#282). */
  exportName?: string
}

// Tabla de posiciones de Portfolio (#269): solo presentación y orden. Antes
// calculaba sus propias filas, su polvo y su total, con lo que cada wallet
// tenía su bloque de polvo y el «% cartera» era relativo a la propia tabla.
export function AssetTable({ rows, portfolioTotal, compact = false, hideWalletChips = false, keyByWallet = false, onSimulate, onOpen, header, exportName }: AssetTableProps) {
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

  const sorted = useMemo(
    () => sortRows(rows, sortKey, sortDir, prices, portfolioTotal),
    [rows, sortKey, sortDir, prices, portfolioTotal],
  )
  const defaultOrder = sortKey === 'value' && sortDir === 'desc'

  // Cierres de 7 días de todos los activos de la tabla en una sola petición (#282).
  const cryptoAssets = useMemo(
    () => [...new Set(rows.filter(r => r.kind === 'crypto').map(r => r.asset))].sort(),
    [rows],
  )
  const { data: closes } = useQuery({
    queryKey: ['price-closes', 7, cryptoAssets.join(',')],
    queryFn: () => pricesApi.getCloses(cryptoAssets, 7),
    enabled: cryptoAssets.length > 0,
    staleTime: 10 * 60_000,
  })
  const spark = (asset: string) => {
    const series = closes?.closes[asset]
    return series && rate !== null ? sparkSeries(series, rawPrices[asset], rate) : undefined
  }

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
  const rowKey = (row: UnifiedRow) => `${row.kind}-${row.asset}-${keyByWallet ? row.wallets[0]?.wallet_id ?? '' : ''}-${currency}`

  return (
    <div>
      {(header || !defaultOrder || exportName) && (
        <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">{header}</div>
          <div className="flex items-center gap-2">
            {!defaultOrder && (
              <button type="button" onClick={() => { setSortKey('value'); setSortDir('desc') }}
                className={buttonClasses('secondary', 'sm', 'flex gap-1')} title="Restablecer el orden por valor">
                <ArrowUpDown size={10} aria-hidden="true" /> Orden por valor
              </button>
            )}
            {exportName && (
              // En modo privacidad no se exportan importes.
              <button type="button" onClick={exportCsv} disabled={privacy || sorted.length === 0}
                className={buttonClasses('secondary', 'sm', 'flex gap-1')}
                title={privacy ? 'Desactiva el modo privacidad para exportar' : 'Exportar las posiciones visibles a CSV'}>
                <Download size={11} aria-hidden="true" /> CSV
              </button>
            )}
          </div>
        </div>
      )}
      {/* Cabecera fija al desplazarse (#271): sin contenedor de scroll propio en
          pantallas anchas; en estrechas, desplazamiento horizontal. */}
      <div className="max-lg:overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-background-card [&_th]:shadow-[inset_0_-1px_0_var(--cf-border)]">
            <tr className={tableHeadRowClasses()}>
              <SortTh {...sortProps} label="Activo" sk="asset" right={false} />
              <SortTh {...sortProps} label="Cantidad" sk="quantity" />
              <SortTh {...sortProps} label="Precio" sk="price" />
              <th scope="col" className="px-2 py-2.5 text-right whitespace-nowrap" title="Tendencia de los últimos 7 días">7 d</th>
              <SortTh {...sortProps} label="Valor" sk="value" title={`Valor en ${currency}`} />
              <SortTh {...sortProps} label="P&L" sk="pnl" title="P&L no realizado en importe y %" />
              {!compact && <SortTh {...sortProps} label="Break-even" sk="breakeven" title="Precio medio de compra y distancia del precio actual. La subida para recuperar es mayor que la caída: tras caer un 50 %, hace falta subir un 100 %." />}
              <SortTh {...sortProps} label="% cartera" sk="weight" />
            </tr>
          </thead>
          <tbody ref={tbodyRef} className="divide-y divide-border" onKeyDown={handleKeyDown}>
            {sorted.map(row => row.kind === 'fiat'
              ? <FiatRowComponent key={rowKey(row)} rowKey={rowKey(row)} row={row} totalPortfolioValue={portfolioTotal} compact={compact} />
              : <CryptoRowComponent key={rowKey(row)} rowKey={rowKey(row)} spark={spark(row.asset)} row={row} prices={prices} yesterdayPrices={yesterdayPrices}
                  totalPortfolioValue={portfolioTotal} compact={compact} onSimulate={simulate} hideWalletChips={hideWalletChips} onOpen={onOpen}
                  lockedAmounts={lockedAmounts.filter(l => l.asset === row.asset && row.wallets.some(w => w.wallet_id === l.wallet_id))} />)}
          </tbody>
          {/* Totales de las filas visibles (#282) */}
          {sorted.length > 1 && (
            <tfoot>
              <tr className={tableFootRowClasses('text-sm')}>
                <th scope="row" className="px-4 py-3 text-left font-semibold text-fg">Total</th>
                <td colSpan={3} />
                <td className="px-4 py-3 text-right mono font-semibold text-fg">{formatMoney(totals.value, currency)}</td>
                <td className="px-4 py-3 text-right mono">
                  {totals.pnlPct !== null && (
                    <div className="flex flex-col items-end gap-0.5">
                      <span className={`font-medium ${pnlColor(totals.pnl)}`}>{totals.pnl >= 0 ? '+' : ''}{formatMoney(totals.pnl, currency)}</span>
                      <PnlPill pct={totals.pnlPct} />
                    </div>
                  )}
                </td>
                {!compact && <td />}
                <td className="px-4 py-3"><WeightCell pct={totals.weightPct} /></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
