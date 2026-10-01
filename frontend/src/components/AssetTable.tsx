import { useState, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Settings, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { type FifoLot, type FiatBalance, portfolioApi } from '../api/portfolio'
import { usePricesStore } from '../store/pricesStore'
import { formatEur } from '../utils/format'
import { buildRows, sortRows, type CryptoRow, type UnifiedRow, type SortKey, type SortDir } from '../utils/assetTable'
import { CryptoRowComponent } from './AssetTableCryptoRow'
import { FiatRowComponent } from './AssetTableFiatRow'

interface AssetTableProps {
  lots: FifoLot[]
  fiatBalances?: FiatBalance[]
  onSimulate?: (asset: string, qty: number, price: number) => void
}

const DUST_THRESHOLD = 1

export function AssetTable({ lots, fiatBalances = [], onSimulate }: AssetTableProps) {
  const prices   = usePricesStore(s => s.prices)
  const { data: ydayData } = useQuery({
    queryKey: ['yesterday-prices'],
    queryFn: portfolioApi.getYesterdayPrices,
    staleTime: 10 * 60_000,
  })
  const { data: lockedAmounts = [] } = useQuery({
    queryKey: ['locked-amounts'],
    queryFn: portfolioApi.getLockedAmounts,
    staleTime: 60_000,
  })
  const yesterdayPrices = ydayData?.prices ?? {}
  const [dustOpen,  setDustOpen]  = useState(false)
  const [compact,   setCompact]   = useState(false)
  const [sortKey,   setSortKey]   = useState<SortKey>('value')
  const [sortDir,   setSortDir]   = useState<SortDir>('desc')

  const handleSort = useCallback((key: SortKey) => {
    setSortKey(prev => {
      if (prev === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
      else { setSortDir('desc') }
      return key
    })
  }, [])

  const allRows  = buildRows(lots, prices, fiatBalances)
  const mainRows = allRows.filter(r => {
    if (r.kind === 'fiat') return r.value >= DUST_THRESHOLD
    const price = prices[r.asset] ?? 0
    return price === 0 || r.value >= DUST_THRESHOLD
  })
  const dustRows = allRows.filter(r => {
    if (r.kind === 'fiat') return r.value > 0 && r.value < DUST_THRESHOLD
    const price = prices[r.asset] ?? 0
    return price > 0 && r.value < DUST_THRESHOLD
  })

  const totalValue = allRows.reduce((s, r) => s + r.value, 0)
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

  // Cabecera ordenable: closure local sobre sortKey/sortDir/handleSort — no
  // se extrae a un fichero propio porque necesita acceso directo a ambos
  // para elegir el icono de dirección, y no se reutiliza fuera de esta tabla.
  function SortTh({ label, sk, right = true, title }: { label: string; sk: SortKey; right?: boolean; title?: string }) {
    const active = sortKey === sk
    const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
    return (
      <th
        className={`px-4 py-3 cursor-pointer select-none group ${right ? 'text-right' : 'text-left'}`}
        onClick={() => handleSort(sk)}
        title={title}
      >
        <span className="inline-flex items-center gap-1 hover:text-gray-300 transition-colors">
          {right && <Icon size={10} className={active ? 'text-accent-blue' : 'text-gray-700 group-hover:text-gray-500'} />}
          <span className={active ? 'text-accent-blue' : ''}>{label}</span>
          {!right && <Icon size={10} className={active ? 'text-accent-blue' : 'text-gray-700 group-hover:text-gray-500'} />}
        </span>
      </th>
    )
  }

  const tableHeader = (
    <thead>
      <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-border">
        <SortTh label="Activo"     sk="asset"    right={false} />
        <SortTh label="Cantidad"   sk="quantity"  />
        <SortTh label="Precio"     sk="price"     />
        {!compact && <SortTh label="P. medio" sk="breakeven" title="Precio medio de compra (break-even)" />}
        <SortTh label="Valor EUR"  sk="value"     />
        {!compact && <SortTh label="Coste base" sk="cost" />}
        {!compact && <SortTh label="P&L"        sk="pnl"  />}
        <SortTh label="P&L %"      sk="pnlpct"   />
        <SortTh label="% Cartera"  sk="weight"   />
      </tr>
    </thead>
  )

  const renderRow = (row: UnifiedRow) =>
    row.kind === 'fiat'
      ? <FiatRowComponent key={`fiat-${row.asset}`} row={row} totalPortfolioValue={totalValue} compact={compact} />
      : <CryptoRowComponent key={row.asset} row={row} prices={prices} yesterdayPrices={yesterdayPrices} totalPortfolioValue={totalValue} compact={compact} onSimulate={onSimulate} lockedAmounts={lockedAmounts.filter(l => l.asset === row.asset)} />

  // Activos sin precio configurado
  const noPriceAssets = mainRows
    .filter(r => r.kind === 'crypto' && (prices[(r as CryptoRow).asset] ?? 0) === 0)
    .map(r => r.asset)

  return (
    <div className="space-y-3">
      {/* Banner si hay activos sin precio */}
      {noPriceAssets.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-accent-amber/5 border border-accent-amber/20 rounded-xl text-xs">
          <span className="text-accent-amber/90">
            {noPriceAssets.length === 1
              ? <><span className="font-mono font-semibold">{noPriceAssets[0]}</span> no tiene precio configurado — valor y P&L no disponibles</>
              : <><span className="font-mono font-semibold">{noPriceAssets.join(', ')}</span> no tienen precio configurado</>
            }
          </span>
          <Link
            to="/settings?tab=assets"
            className="flex items-center gap-1 text-accent-amber hover:text-accent-amber/80 font-medium transition-colors shrink-0 ml-3"
          >
            <Settings size={11} />
            Configurar en Settings
          </Link>
        </div>
      )}

      <div className="card overflow-hidden p-0">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-sm">Activos</h3>
            {(sortKey !== 'value' || sortDir !== 'desc') && (
              <button
                type="button"
                onClick={() => { setSortKey('value'); setSortDir('desc') }}
                className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-white bg-background-tertiary hover:bg-border border border-border rounded-md px-1.5 py-0.5 transition-colors"
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
              className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md border transition-colors ${
                compact
                  ? 'border-accent-blue/40 bg-accent-blue/10 text-accent-blue'
                  : 'border-border text-gray-500 hover:border-gray-600 hover:text-gray-300'
              }`}
              title={compact ? 'Ver tabla completa' : 'Vista compacta'}
            >
              {compact ? '⊞ Expandir' : '⊟ Compacto'}
            </button>
            <span className="text-xs text-gray-500">
              Valor total: <span className="text-white mono">{formatEur(totalValue)}</span>
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
        <div className={`card overflow-hidden p-0 ${onlyDust ? 'border-amber-500/20 bg-amber-500/[0.02]' : ''}`}>
          <button
            type="button"
            onClick={() => setDustOpen(!dustOpen)}
            className="w-full px-5 py-3 flex items-center justify-between hover:bg-background-tertiary/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {(dustOpen || onlyDust)
                ? <ChevronDown size={14} className={onlyDust ? 'text-amber-500/70' : 'text-gray-500'} />
                : <ChevronRight size={14} className="text-gray-500" />}
              <span className={`text-xs font-semibold uppercase tracking-wider ${onlyDust ? 'text-amber-500/80' : 'text-gray-500'}`}>
                Polvo
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                onlyDust
                  ? 'bg-amber-500/15 text-amber-500/80 border border-amber-500/20'
                  : 'bg-background-tertiary text-gray-500'
              }`}>
                {dustRows.length} activos &lt; €1
              </span>
              {onlyDust && (
                <span className="text-[10px] text-amber-500/60 italic">esta wallet solo tiene polvo</span>
              )}
            </div>
            <span className={`text-xs mono font-medium ${onlyDust ? 'text-amber-500/70' : 'text-gray-600'}`}>
              {formatEur(dustValue)}
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
