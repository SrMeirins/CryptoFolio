import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { FifoLot } from '../api/portfolio'
import { usePricesStore } from '../store/pricesStore'
import { formatEur, formatAmount, pnlColor } from '../utils/format'

interface AssetTableProps {
  lots: FifoLot[]
}

interface AssetRow {
  asset: string
  wallets: { wallet_id: string; wallet_name: string; wallet_color: string; wallet_kind: string; quantity: number; costBasis: number }[]
  totalQuantity: number
  totalCostBasis: number
  avgPrice: number
}

function groupByAsset(lots: FifoLot[]): AssetRow[] {
  const map = new Map<string, AssetRow>()

  for (const lot of lots) {
    const qty = parseFloat(lot.quantity)
    const cost = parseFloat(lot.cost_basis_eur)

    if (!map.has(lot.asset)) {
      map.set(lot.asset, {
        asset: lot.asset,
        wallets: [],
        totalQuantity: 0,
        totalCostBasis: 0,
        avgPrice: parseFloat(lot.avg_price_eur),
      })
    }

    const row = map.get(lot.asset)!
    row.totalQuantity += qty
    row.totalCostBasis += cost
    row.wallets.push({ wallet_id: lot.wallet_id, wallet_name: lot.wallet_name, wallet_color: lot.wallet_color, wallet_kind: lot.wallet_kind, quantity: qty, costBasis: cost })
  }

  return [...map.values()].sort((a, b) => b.totalCostBasis - a.totalCostBasis)
}

function AssetRow({ row, prices }: { row: AssetRow; prices: Record<string, number> }) {
  const price = prices[row.asset] ?? 0
  const value = row.totalQuantity * price
  const pnl = value - row.totalCostBasis
  const pnlPct = row.totalCostBasis > 0 ? (pnl / row.totalCostBasis) * 100 : 0
  const walletEntries = row.wallets.reduce((acc, w) => {
    if (!acc.find(x => x.wallet_id === w.wallet_id)) acc.push(w)
    return acc
  }, [] as typeof row.wallets)
  const hasPrice = price > 0

  return (
    <tr className="hover:bg-background-tertiary/50 transition-colors">
      <td className="px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-accent-blue/10 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-accent-blue">
              {row.asset.slice(0, 2)}
            </span>
          </div>
          <span className="font-medium">{row.asset}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-right mono text-gray-300">
        {formatAmount(row.totalQuantity)}
      </td>
      <td className="px-4 py-3 text-right mono">
        {hasPrice ? formatEur(price) : <span className="text-gray-600">—</span>}
      </td>
      <td className="px-4 py-3 text-right mono font-medium">
        {hasPrice ? formatEur(value) : <span className="text-gray-600">—</span>}
      </td>
      <td className="px-4 py-3 text-right mono text-gray-400">
        {formatEur(row.totalCostBasis)}
      </td>
      <td className={`px-4 py-3 text-right mono font-medium ${hasPrice ? pnlColor(pnl) : 'text-gray-600'}`}>
        {hasPrice ? (pnl >= 0 ? '+' : '') + formatEur(pnl) : '—'}
      </td>
      <td className={`px-4 py-3 text-right mono text-sm ${hasPrice ? pnlColor(pnl) : 'text-gray-600'}`}>
        {hasPrice ? (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(2) + '%' : '—'}
      </td>
      <td className="px-4 py-3 text-center">
        <div className="flex gap-1 justify-center flex-wrap">
          {walletEntries.map((w) => (
            <span
              key={w.wallet_id}
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: `${w.wallet_color}20`, color: w.wallet_color }}
            >
              {w.wallet_name.slice(0, 3).toUpperCase()}
            </span>
          ))}
        </div>
      </td>
    </tr>
  )
}

export function AssetTable({ lots }: AssetTableProps) {
  const prices = usePricesStore((s) => s.prices)
  const [dustOpen, setDustOpen] = useState(false)
  const rows = groupByAsset(lots)

  const DUST_THRESHOLD = 1 // EUR

  const mainRows = rows.filter((row) => {
    const price = prices[row.asset] ?? 0
    const value = row.totalQuantity * price
    // Si no tenemos precio aún, mostrarlo en main por defecto
    return price === 0 || value >= DUST_THRESHOLD
  })

  const dustRows = rows.filter((row) => {
    const price = prices[row.asset] ?? 0
    const value = row.totalQuantity * price
    return price > 0 && value < DUST_THRESHOLD
  })

  const totalValue = rows.reduce((sum, row) => {
    return sum + row.totalQuantity * (prices[row.asset] ?? 0)
  }, 0)

  const dustValue = dustRows.reduce((sum, row) => {
    return sum + row.totalQuantity * (prices[row.asset] ?? 0)
  }, 0)

  const tableHeader = (
    <thead>
      <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-border">
        <th className="text-left px-5 py-3">Activo</th>
        <th className="text-right px-4 py-3">Cantidad</th>
        <th className="text-right px-4 py-3">Precio</th>
        <th className="text-right px-4 py-3">Valor EUR</th>
        <th className="text-right px-4 py-3">Coste base</th>
        <th className="text-right px-4 py-3">P&L</th>
        <th className="text-right px-4 py-3">P&L %</th>
        <th className="text-center px-4 py-3">Wallet</th>
      </tr>
    </thead>
  )

  return (
    <div className="space-y-3">
      {/* Tabla principal */}
      <div className="card overflow-hidden p-0">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="font-medium text-sm">Activos</h3>
          <span className="text-xs text-gray-500">
            Valor total:{' '}
            <span className="text-white mono">{formatEur(totalValue)}</span>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            {tableHeader}
            <tbody className="divide-y divide-border">
              {mainRows.map((row) => (
                <AssetRow key={`${row.asset}-main`} row={row} prices={prices} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sección polvo */}
      {dustRows.length > 0 && (
        <div className="card overflow-hidden p-0">
          <button
            onClick={() => setDustOpen(!dustOpen)}
            className="w-full px-5 py-3 flex items-center justify-between hover:bg-background-tertiary/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {dustOpen
                ? <ChevronDown size={14} className="text-gray-500" />
                : <ChevronRight size={14} className="text-gray-500" />
              }
              <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">
                Polvo
              </span>
              <span className="text-xs bg-background-tertiary text-gray-500 px-2 py-0.5 rounded-full">
                {dustRows.length} activos
              </span>
            </div>
            <span className="text-xs text-gray-600 mono">{formatEur(dustValue)}</span>
          </button>

          {dustOpen && (
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full text-sm">
                {tableHeader}
                <tbody className="divide-y divide-border">
                  {dustRows.map((row) => (
                    <AssetRow key={`${row.asset}-dust`} row={row} prices={prices} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
