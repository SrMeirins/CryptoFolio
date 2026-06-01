import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { FifoLot, FiatBalance } from '../api/portfolio'
import { usePricesStore } from '../store/pricesStore'
import { formatEur, formatAmount, pnlColor } from '../utils/format'

interface AssetTableProps {
  lots: FifoLot[]
  fiatBalances?: FiatBalance[]
}

// ── Tipos unificados ───────────────────────────────────────────────────────

interface CryptoRow {
  kind: 'crypto'
  asset: string
  value: number
  totalQuantity: number
  totalCostBasis: number
  avgPrice: number
  wallets: { wallet_id: string; wallet_name: string; wallet_color: string; wallet_kind: string }[]
}

interface FiatRow {
  kind: 'fiat'
  asset: string
  value: number
  wallets: { wallet_id: string; wallet_name: string; wallet_color: string }[]
}

type UnifiedRow = CryptoRow | FiatRow

// ── Agrupación ────────────────────────────────────────────────────────────

function buildRows(
  lots: FifoLot[],
  prices: Record<string, number>,
  fiatBalances: FiatBalance[]
): UnifiedRow[] {
  const cryptoMap = new Map<string, CryptoRow>()

  for (const lot of lots) {
    const qty  = parseFloat(lot.quantity)
    const cost = parseFloat(lot.cost_basis_eur)
    const price = prices[lot.asset] ?? 0

    if (!cryptoMap.has(lot.asset)) {
      cryptoMap.set(lot.asset, {
        kind: 'crypto',
        asset: lot.asset,
        value: 0,
        totalQuantity: 0,
        totalCostBasis: 0,
        avgPrice: parseFloat(lot.avg_price_eur),
        wallets: [],
      })
    }
    const row = cryptoMap.get(lot.asset)!
    row.totalQuantity  += qty
    row.totalCostBasis += cost
    row.value           = row.totalQuantity * price
    if (!row.wallets.find(w => w.wallet_id === lot.wallet_id)) {
      row.wallets.push({
        wallet_id: lot.wallet_id,
        wallet_name: lot.wallet_name,
        wallet_color: lot.wallet_color,
        wallet_kind: lot.wallet_kind,
      })
    }
  }

  const fiatMap = new Map<string, FiatRow>()
  for (const b of fiatBalances) {
    const bal = parseFloat(b.balance)
    if (!fiatMap.has(b.asset)) {
      fiatMap.set(b.asset, { kind: 'fiat', asset: b.asset, value: 0, wallets: [] })
    }
    const row = fiatMap.get(b.asset)!
    row.value += bal
    if (!row.wallets.find(w => w.wallet_id === b.wallet_id)) {
      row.wallets.push({
        wallet_id: b.wallet_id,
        wallet_name: b.wallet_name,
        wallet_color: b.wallet_color,
      })
    }
  }

  const all: UnifiedRow[] = [
    ...cryptoMap.values(),
    ...fiatMap.values(),
  ]

  return all.sort((a, b) => b.value - a.value)
}

// ── Fila cripto ───────────────────────────────────────────────────────────

function CryptoRow({ row, prices }: { row: CryptoRow; prices: Record<string, number> }) {
  const price  = prices[row.asset] ?? 0
  const pnl    = row.value - row.totalCostBasis
  const pnlPct = row.totalCostBasis > 0 ? (pnl / row.totalCostBasis) * 100 : 0
  const hasPrice = price > 0

  return (
    <tr className="hover:bg-background-tertiary/50 transition-colors">
      <td className="px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-accent-blue/10 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-accent-blue">{row.asset.slice(0, 2)}</span>
          </div>
          <span className="font-medium">{row.asset}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-right mono text-gray-300">{formatAmount(row.totalQuantity)}</td>
      <td className="px-4 py-3 text-right mono">
        {hasPrice ? formatEur(price) : <span className="text-gray-600">—</span>}
      </td>
      <td className="px-4 py-3 text-right mono font-medium">
        {hasPrice ? formatEur(row.value) : <span className="text-gray-600">—</span>}
      </td>
      <td className="px-4 py-3 text-right mono text-gray-400">{formatEur(row.totalCostBasis)}</td>
      <td className={`px-4 py-3 text-right mono font-medium ${hasPrice ? pnlColor(pnl) : 'text-gray-600'}`}>
        {hasPrice ? (pnl >= 0 ? '+' : '') + formatEur(pnl) : '—'}
      </td>
      <td className={`px-4 py-3 text-right mono text-sm ${hasPrice ? pnlColor(pnlPct) : 'text-gray-600'}`}>
        {hasPrice ? (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(2) + '%' : '—'}
      </td>
      <td className="px-4 py-3 text-center">
        <div className="flex gap-1 justify-center flex-wrap">
          {row.wallets.map(w => (
            <span key={w.wallet_id} className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: `${w.wallet_color}20`, color: w.wallet_color }}>
              {w.wallet_name.slice(0, 3).toUpperCase()}
            </span>
          ))}
        </div>
      </td>
    </tr>
  )
}

// ── Fila fiat ─────────────────────────────────────────────────────────────

const FIAT_SYMBOLS: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', CHF: '₣' }

function FiatRowComponent({ row }: { row: FiatRow }) {
  const symbol = FIAT_SYMBOLS[row.asset] ?? row.asset[0]

  return (
    <tr className="hover:bg-background-tertiary/50 transition-colors">
      <td className="px-5 py-3">
        <div className="flex items-center gap-2">
          {/* Icono con símbolo fiat y anillo verde */}
          <div className="w-7 h-7 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 ring-1 ring-emerald-500/30">
            <span className="text-sm font-bold text-emerald-400">{symbol}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.asset}</span>
            {/* Badge FIAT pequeño y discreto */}
            <span className="text-[10px] font-semibold tracking-widest text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded uppercase">
              FIAT
            </span>
          </div>
        </div>
      </td>
      {/* Cantidad = el propio balance en EUR */}
      <td className="px-4 py-3 text-right mono text-gray-300">
        {formatEur(row.value)}
      </td>
      {/* Precio siempre 1:1 */}
      <td className="px-4 py-3 text-right mono text-gray-500">
        1,00 €
      </td>
      {/* Valor = balance */}
      <td className="px-4 py-3 text-right mono font-medium text-white">
        {formatEur(row.value)}
      </td>
      {/* Sin coste base ni P&L */}
      <td className="px-4 py-3 text-right mono text-gray-600">—</td>
      <td className="px-4 py-3 text-right mono text-gray-600">—</td>
      <td className="px-4 py-3 text-right mono text-gray-600">—</td>
      <td className="px-4 py-3 text-center">
        <div className="flex gap-1 justify-center flex-wrap">
          {row.wallets.map(w => (
            <span key={w.wallet_id} className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: `${w.wallet_color}20`, color: w.wallet_color }}>
              {w.wallet_name.slice(0, 3).toUpperCase()}
            </span>
          ))}
        </div>
      </td>
    </tr>
  )
}

// ── Tabla principal ────────────────────────────────────────────────────────

const DUST_THRESHOLD = 1

export function AssetTable({ lots, fiatBalances = [] }: AssetTableProps) {
  const prices = usePricesStore(s => s.prices)
  const [dustOpen, setDustOpen] = useState(false)

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

  const renderRow = (row: UnifiedRow) =>
    row.kind === 'fiat'
      ? <FiatRowComponent key={`fiat-${row.asset}-${row.wallets[0]?.wallet_id}`} row={row} />
      : <CryptoRow key={`${row.asset}-main`} row={row} prices={prices} />

  return (
    <div className="space-y-3">
      <div className="card overflow-hidden p-0">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="font-medium text-sm">Activos</h3>
          <span className="text-xs text-gray-500">
            Valor total: <span className="text-white mono">{formatEur(totalValue)}</span>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            {tableHeader}
            <tbody className="divide-y divide-border">
              {mainRows.map(renderRow)}
            </tbody>
          </table>
        </div>
      </div>

      {dustRows.length > 0 && (
        <div className="card overflow-hidden p-0">
          <button
            onClick={() => setDustOpen(!dustOpen)}
            className="w-full px-5 py-3 flex items-center justify-between hover:bg-background-tertiary/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {dustOpen
                ? <ChevronDown size={14} className="text-gray-500" />
                : <ChevronRight size={14} className="text-gray-500" />}
              <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Polvo</span>
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
                  {dustRows.map(renderRow)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
