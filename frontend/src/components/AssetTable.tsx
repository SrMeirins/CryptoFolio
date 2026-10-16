import { useState, useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpDown } from 'lucide-react'
import { portfolioApi } from '../api/portfolio'
import { useDisplayMarket } from '../hooks/useDisplayMarket'
import { usePricesStore } from '../store/pricesStore'
import { sortRows, nextSort, type UnifiedRow, type SortKey, type SortDir } from '../utils/assetTable'
import { CryptoRowComponent } from './AssetTableCryptoRow'
import { FiatRowComponent } from './AssetTableFiatRow'
import { SortTh } from './AssetTableSortTh'
import { buttonClasses, tableHeadRowClasses } from './ui'

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
  /** Contenido de la barra superior, a la izquierda del botón de restablecer orden. */
  header?: ReactNode
}

// Tabla de posiciones de Portfolio (#269): solo presentación y orden. Antes
// calculaba sus propias filas, su polvo y su total, con lo que cada wallet
// tenía su bloque de polvo y el «% cartera» era relativo a la propia tabla.
export function AssetTable({ rows, portfolioTotal, compact = false, hideWalletChips = false, keyByWallet = false, onSimulate, header }: AssetTableProps) {
  // Precios en vivo y de hace 24h (WebSocket, #147) en la moneda de visualización (#177).
  const { currency, prices, open24: yesterdayPrices } = useDisplayMarket()
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

  const sortProps = { sortKey, sortDir, onSort: handleSort }
  const rowKey = (row: UnifiedRow) => `${row.kind}-${row.asset}-${keyByWallet ? row.wallets[0]?.wallet_id ?? '' : ''}-${currency}`

  return (
    <div>
      {(header || !defaultOrder) && (
        <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">{header}</div>
          {!defaultOrder && (
            <button type="button" onClick={() => { setSortKey('value'); setSortDir('desc') }}
              className={buttonClasses('secondary', 'sm', 'flex gap-1')} title="Restablecer el orden por valor">
              <ArrowUpDown size={10} aria-hidden="true" /> Orden por valor
            </button>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className={tableHeadRowClasses()}>
              <SortTh {...sortProps} label="Activo" sk="asset" right={false} />
              <SortTh {...sortProps} label="Cantidad" sk="quantity" />
              <SortTh {...sortProps} label="Precio" sk="price" />
              {!compact && <SortTh {...sortProps} label="P. medio" sk="breakeven" title="Precio medio de compra (break-even)" />}
              <SortTh {...sortProps} label="Valor" sk="value" title={`Valor en ${currency}`} />
              {!compact && <SortTh {...sortProps} label="Coste base" sk="cost" />}
              {!compact && <SortTh {...sortProps} label="P&L" sk="pnl" />}
              <SortTh {...sortProps} label="P&L %" sk="pnlpct" />
              <SortTh {...sortProps} label="% cartera" sk="weight" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map(row => row.kind === 'fiat'
              ? <FiatRowComponent key={rowKey(row)} row={row} totalPortfolioValue={portfolioTotal} compact={compact} />
              : <CryptoRowComponent key={rowKey(row)} row={row} prices={prices} yesterdayPrices={yesterdayPrices}
                  totalPortfolioValue={portfolioTotal} compact={compact} onSimulate={simulate} hideWalletChips={hideWalletChips}
                  lockedAmounts={lockedAmounts.filter(l => l.asset === row.asset && row.wallets.some(w => w.wallet_id === l.wallet_id))} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}
