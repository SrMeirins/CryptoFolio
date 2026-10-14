import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Settings, ArrowUpDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { type FifoLot, type FiatBalance, portfolioApi } from '../api/portfolio'
import { formatMoney } from '../utils/format'
import { useDisplayLots, useDisplayMarket } from '../hooks/useDisplayMarket'
import { usePricesStore } from '../store/pricesStore'
import { buildRows, sortRows, nextSort, type CryptoRow, type UnifiedRow, type SortKey, type SortDir } from '../utils/assetTable'
import { CryptoRowComponent } from './AssetTableCryptoRow'
import { FiatRowComponent } from './AssetTableFiatRow'
import { SortTh } from './AssetTableSortTh'
import { valuePortfolio } from '../utils/portfolioValuation'
import { cardClasses, buttonClasses } from './ui'

interface AssetTableProps {
  lots: FifoLot[]
  fiatBalances?: FiatBalance[]
  onSimulate?: (asset: string, qty: number, price: number) => void
}

// Referencia estable para el valor por defecto: un `[]` literal en la firma
// crearía un array nuevo en cada render e invalidaría los useMemo.
const NO_FIAT: FiatBalance[] = []

export function AssetTable({ lots: rawLots, fiatBalances = NO_FIAT, onSimulate }: AssetTableProps) {
  // Precios en vivo y de hace 24h (WebSocket, #147) y coste de los lotes, en la
  // moneda de visualización (#177).
  const market = useDisplayMarket()
  const { currency, prices, open24: yesterdayPrices, rate, dustThreshold } = market
  const lots = useDisplayLots(rawLots, market)
  const fiatPrice = rate ?? 0
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
  const [dustOpen,  setDustOpen]  = useState(false)
  const [compact,   setCompact]   = useState(false)
  const [sortKey,   setSortKey]   = useState<SortKey>('value')
  const [sortDir,   setSortDir]   = useState<SortDir>('desc')

  // Se calcula a partir del estado actual (no dentro de un updater): los
  // updaters deben ser puros y StrictMode los ejecuta dos veces en desarrollo.
  function handleSort(key: SortKey) {
    const next = nextSort(key, sortKey, sortDir)
    setSortKey(next.key)
    setSortDir(next.dir)
  }

  const { mainRows, dustRows } = useMemo(() => {
    const all = buildRows(lots, prices, fiatBalances, fiatPrice)
    const main = all.filter(r => {
      if (r.kind === 'fiat') return r.value >= dustThreshold
      const price = prices[r.asset] ?? 0
      return price === 0 || r.value >= dustThreshold
    })
    const dust = all.filter(r => {
      if (r.kind === 'fiat') return r.value > 0 && r.value < dustThreshold
      const price = prices[r.asset] ?? 0
      return price > 0 && r.value < dustThreshold
    })
    return { mainRows: main, dustRows: dust }
  }, [lots, prices, fiatBalances, fiatPrice, dustThreshold])

  // Total de la tabla con la valoración común (#150); coincide con la suma de filas.
  const totalValue = useMemo(
    () => valuePortfolio(lots, prices, fiatBalances, fiatPrice).totalValue,
    [lots, prices, fiatBalances, fiatPrice],
  )
  const dustValue  = dustRows.reduce((s, r) => s + r.value, 0)
  const onlyDust   = mainRows.length === 0 && dustRows.length > 0

  const sortedMain = useMemo(
    () => sortRows(mainRows, sortKey, sortDir, prices, totalValue),
    [mainRows, sortKey, sortDir, prices, totalValue]
  )
  const sortedDust = useMemo(
    () => sortRows(dustRows, sortKey, sortDir, prices, totalValue),
    [dustRows, sortKey, sortDir, prices, totalValue]
  )

  const sortProps = { sortKey, sortDir, onSort: handleSort }
  const tableHeader = (
    <thead>
      <tr className="text-xs text-fg-subtle uppercase tracking-wider border-b border-border">
        <SortTh {...sortProps} label="Activo"     sk="asset"    right={false} />
        <SortTh {...sortProps} label="Cantidad"   sk="quantity"  />
        <SortTh {...sortProps} label="Precio"     sk="price"     />
        {!compact && <SortTh {...sortProps} label="P. medio" sk="breakeven" title="Precio medio de compra (break-even)" />}
        <SortTh {...sortProps} label={`Valor ${currency}`} sk="value" />
        {!compact && <SortTh {...sortProps} label="Coste base" sk="cost" />}
        {!compact && <SortTh {...sortProps} label="P&L"        sk="pnl"  />}
        <SortTh {...sortProps} label="P&L %"      sk="pnlpct"   />
        <SortTh {...sortProps} label="% Cartera"  sk="weight"   />
      </tr>
    </thead>
  )

  const renderRow = (row: UnifiedRow) =>
    row.kind === 'fiat'
      ? <FiatRowComponent key={`fiat-${row.asset}-${currency}`} row={row} totalPortfolioValue={totalValue} compact={compact} />
      : <CryptoRowComponent key={`${row.asset}-${currency}`} row={row} prices={prices} yesterdayPrices={yesterdayPrices} totalPortfolioValue={totalValue} compact={compact} onSimulate={simulate} lockedAmounts={lockedAmounts.filter(l => l.asset === row.asset)} />

  // Activos sin precio configurado
  const noPriceAssets = mainRows
    .filter(r => r.kind === 'crypto' && (prices[(r as CryptoRow).asset] ?? 0) === 0)
    .map(r => r.asset)

  return (
    <div className="space-y-3">
      {/* Banner si hay activos sin precio */}
      {noPriceAssets.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-warning/5 border border-warning/20 rounded-xl text-xs">
          <span className="text-warning/90">
            {noPriceAssets.length === 1
              ? <><span className="mono font-semibold">{noPriceAssets[0]}</span> no tiene precio configurado — valor y P&L no disponibles</>
              : <><span className="mono font-semibold">{noPriceAssets.join(', ')}</span> no tienen precio configurado</>
            }
          </span>
          <Link
            to="/settings?tab=assets"
            className="flex items-center gap-1 text-warning hover:text-warning/80 font-medium transition-colors shrink-0 ml-3"
          >
            <Settings size={11} />
            Configurar en Settings
          </Link>
        </div>
      )}

      <div className={cardClasses('none', 'overflow-hidden')}>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-sm">Activos</h3>
            {(sortKey !== 'value' || sortDir !== 'desc') && (
              <button
                type="button"
                onClick={() => { setSortKey('value'); setSortDir('desc') }}
                className={buttonClasses('secondary', 'sm', 'flex gap-1')}
                title="Restablecer orden por defecto"
              >
                <ArrowUpDown size={9} />
                Reset
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Toggle compacto/expandido */}
            <button
              type="button"
              onClick={() => setCompact(c => !c)}
              className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border transition-colors ${
                compact
                  ? 'border-brand/40 bg-brand/10 text-brand'
                  : 'border-border text-fg-subtle hover:border-border hover:text-fg'
              }`}
              title={compact ? 'Ver tabla completa' : 'Vista compacta'}
            >
              {compact ? '⊞ Expandir' : '⊟ Compacto'}
            </button>
            <span className="text-xs text-fg-subtle">
              Valor total: <span className="text-fg mono">{formatMoney(totalValue, currency)}</span>
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            {tableHeader}
            <tbody className="divide-y divide-border">
              {sortedMain.map(renderRow)}
            </tbody>
          </table>
        </div>
      </div>

      {dustRows.length > 0 && (
        <div className={cardClasses('none', `overflow-hidden ${onlyDust ? 'border-warning/20 bg-warning/2' : ''}`)}>
          <button
            type="button"
            onClick={() => setDustOpen(!dustOpen)}
            className="w-full px-5 py-3 flex items-center justify-between hover:bg-background-tertiary/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {(dustOpen || onlyDust)
                ? <ChevronDown size={14} className={onlyDust ? 'text-warning/70' : 'text-fg-subtle'} />
                : <ChevronRight size={14} className="text-fg-subtle" />}
              <span className={`text-xs font-semibold uppercase tracking-wider ${onlyDust ? 'text-warning/80' : 'text-fg-subtle'}`}>
                Polvo
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                onlyDust
                  ? 'bg-warning/15 text-warning/80 border border-warning/20'
                  : 'bg-background-tertiary text-fg-subtle'
              }`}>
                {dustRows.length} activos &lt; €1
              </span>
              {onlyDust && (
                <span className="text-xs text-warning/60 italic">esta wallet solo tiene polvo</span>
              )}
            </div>
            <span className={`text-xs mono font-medium ${onlyDust ? 'text-warning/70' : 'text-fg-subtle'}`}>
              {formatMoney(dustValue, currency)}
            </span>
          </button>
          {(dustOpen || onlyDust) && (
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full text-sm">
                {tableHeader}
                <tbody className="divide-y divide-border">
                  {sortedDust.map(renderRow)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
