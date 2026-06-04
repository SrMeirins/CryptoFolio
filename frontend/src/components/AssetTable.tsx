import { useState, useCallback, useMemo } from 'react'
import { ChevronDown, ChevronRight, Settings, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { FifoLot, FiatBalance } from '../api/portfolio'
import { usePricesStore } from '../store/pricesStore'
import { formatEur, formatPrice, formatAmount, pnlColor } from '../utils/format'

// ── CryptoIcon ── logo real con fallback ──────────────────────────────────
function CryptoIcon({ symbol, size = 28 }: { symbol: string; size?: number }) {
  const [error, setError] = useState(false)
  const src = `https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`

  if (error) {
    return (
      <div
        className="rounded-full bg-accent-blue/10 flex items-center justify-center shrink-0"
        style={{ width: size, height: size }}
      >
        <span className="text-accent-blue font-bold" style={{ fontSize: size * 0.35 }}>
          {symbol.slice(0, 2)}
        </span>
      </div>
    )
  }

  return (
    <div className="rounded-full overflow-hidden bg-background-tertiary shrink-0 flex items-center justify-center"
      style={{ width: size, height: size }}>
      <img
        src={src}
        alt={symbol}
        width={size}
        height={size}
        onError={() => setError(true)}
        className="w-full h-full object-cover"
      />
    </div>
  )
}

interface AssetTableProps {
  lots: FifoLot[]
  fiatBalances?: FiatBalance[]
}

// ── Wallet breakdown dentro de un activo ──────────────────────────────────

interface WalletBreakdown {
  wallet_id:    string
  wallet_name:  string
  wallet_color: string
  wallet_kind:  string
  quantity:     number
  costBasis:    number
}

// ── Tipos unificados ───────────────────────────────────────────────────────

interface CryptoRow {
  kind:           'crypto'
  asset:          string
  value:          number
  totalQuantity:  number
  totalCostBasis: number
  avgPrice:       number
  wallets:        WalletBreakdown[]
}

interface FiatRow {
  kind:    'fiat'
  asset:   string
  value:   number
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
    const qty   = parseFloat(lot.quantity)
    const cost  = parseFloat(lot.cost_basis_eur)
    const price = prices[lot.asset] ?? 0

    if (!cryptoMap.has(lot.asset)) {
      cryptoMap.set(lot.asset, {
        kind: 'crypto', asset: lot.asset,
        value: 0, totalQuantity: 0, totalCostBasis: 0,
        avgPrice: parseFloat(lot.avg_price_eur),
        wallets: [],
      })
    }
    const row = cryptoMap.get(lot.asset)!
    row.totalQuantity  += qty
    row.totalCostBasis += cost
    row.value           = row.totalQuantity * price

    // Acumular por wallet
    const existing = row.wallets.find(w => w.wallet_id === lot.wallet_id)
    if (existing) {
      existing.quantity += qty
      existing.costBasis += cost
    } else {
      row.wallets.push({
        wallet_id:    lot.wallet_id,
        wallet_name:  lot.wallet_name,
        wallet_color: lot.wallet_color,
        wallet_kind:  lot.wallet_kind,
        quantity:     qty,
        costBasis:    cost,
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
      row.wallets.push({ wallet_id: b.wallet_id, wallet_name: b.wallet_name, wallet_color: b.wallet_color })
    }
  }

  return [
    ...cryptoMap.values(),
    ...fiatMap.values(),
  ].sort((a, b) => b.value - a.value)
}

// ── Fila cripto (con expand) ───────────────────────────────────────────────

const fmtBreakEven = formatPrice

// Nombre corto para chip de wallet:
// Exchange → solo la sub-cuenta ("Binance Spot" → "Spot", "Binance Funding" → "Funding")
// Cold wallet → nombre completo
function walletShortName(name: string, kind: string): string {
  if (kind === 'exchange') {
    const parts = name.split(' ')
    return parts.length > 1 ? parts.slice(1).join(' ') : name
  }
  return name
}

function CryptoRowComponent({ row, prices, totalPortfolioValue, compact = false }: {
  row: CryptoRow
  prices: Record<string, number>
  totalPortfolioValue: number
  compact?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const price      = prices[row.asset] ?? 0
  const pnl        = row.value - row.totalCostBasis
  const pnlPct     = row.totalCostBasis > 0 ? (pnl / row.totalCostBasis) * 100 : 0
  const hasPrice   = price > 0
  const canExpand  = row.wallets.length > 1

  // Break-even: precio al que vendiendo todo recuperas exactamente lo invertido
  const breakEven  = row.totalQuantity > 0 ? row.totalCostBasis / row.totalQuantity : 0

  // Peso sobre el portfolio total
  const portfolioWeight = hasPrice && totalPortfolioValue > 0
    ? (row.value / totalPortfolioValue) * 100
    : null
  const isAboveBE  = hasPrice && price > breakEven   // en beneficio
  const isBelowBE  = hasPrice && price < breakEven   // en pérdida
  const distPct    = breakEven > 0 ? ((price - breakEven) / breakEven) * 100 : null

  return (
    <>
      <tr
        className={`transition-colors ${canExpand ? 'cursor-pointer hover:bg-background-tertiary/60' : 'hover:bg-background-tertiary/30'} ${expanded ? 'bg-background-tertiary/40' : ''}`}
        onClick={() => canExpand && setExpanded(e => !e)}
      >
        {/* Activo */}
        <td className="px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="w-4 shrink-0 flex items-center justify-center">
              {canExpand
                ? expanded
                  ? <ChevronDown size={12} className="text-gray-500" />
                  : <ChevronRight size={12} className="text-gray-500" />
                : <span className="w-3" />
              }
            </div>
            <CryptoIcon symbol={row.asset} size={28} />
            <span className="font-medium">{row.asset}</span>
            {!expanded && (
              <div className="flex gap-1 ml-1">
                {row.wallets.map(w => (
                  <span key={w.wallet_id}
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                    style={{ backgroundColor: `${w.wallet_color}18`, color: w.wallet_color }}>
                    {walletShortName(w.wallet_name, w.wallet_kind)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </td>

        {/* Cantidad */}
        <td className={`px-4 ${compact ? 'py-2' : 'py-3'} text-right mono text-gray-300`}>{formatAmount(row.totalQuantity)}</td>

        {/* Precio actual */}
        <td className={`px-4 ${compact ? 'py-1.5' : 'py-3'} text-right mono`}>
          {hasPrice ? formatPrice(price) : (
            <Link to="/settings?tab=assets"
              className="inline-flex items-center gap-1 text-[11px] text-accent-amber/80 hover:text-accent-amber bg-accent-amber/8 border border-accent-amber/20 px-2 py-0.5 rounded-md transition-colors"
              title="Configura el par de precio en Settings → Activos"
            >
              <Settings size={10} />Sin precio
            </Link>
          )}
        </td>

        {/* Break-even — oculto en compacto */}
        {!compact && (
          <td className="px-4 py-3 text-right">
            <div className="flex flex-col items-end gap-0.5">
              <span className="mono text-gray-300 text-sm">{fmtBreakEven(breakEven)}</span>
              {hasPrice && distPct !== null && (
                <span className={`text-[10px] font-semibold mono px-1.5 py-0.5 rounded-full ${
                  isAboveBE ? 'text-accent-green bg-accent-green/10' : 'text-accent-red bg-accent-red/10'
                }`}>
                  {isAboveBE ? '▲ ' : '▼ '}{Math.abs(distPct).toFixed(1)}%
                </span>
              )}
            </div>
          </td>
        )}

        {/* Valor EUR */}
        <td className={`px-4 ${compact ? 'py-1.5' : 'py-3'} text-right mono font-medium`}>
          {hasPrice ? formatEur(row.value)
            : <span className="text-gray-600 text-xs">—</span>}
        </td>

        {/* Coste base — oculto en compacto */}
        {!compact && (
          <td className="px-4 py-3 text-right mono text-gray-400">{formatEur(row.totalCostBasis)}</td>
        )}

        {/* P&L € — oculto en compacto */}
        {!compact && (
          <td className={`px-4 py-3 text-right mono font-medium ${hasPrice ? pnlColor(pnl) : 'text-gray-600'}`}>
            {hasPrice ? (pnl >= 0 ? '+' : '') + formatEur(pnl) : '—'}
          </td>
        )}

        {/* P&L % */}
        <td className={`px-4 ${compact ? 'py-1.5' : 'py-3'} text-right mono text-sm ${hasPrice ? pnlColor(pnlPct) : 'text-gray-600'}`}>
          {hasPrice ? (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(2) + '%' : '—'}
        </td>

        {/* % Cartera */}
        <td className="px-4 py-3">
          {portfolioWeight !== null ? (
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs mono text-gray-400">{portfolioWeight.toFixed(1)}%</span>
              <div className="w-16 h-1 bg-background-tertiary rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent-blue/60 transition-all duration-500"
                  style={{ width: `${Math.min(portfolioWeight, 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <span className="text-gray-700 text-xs">—</span>
          )}
        </td>
      </tr>

      {/* Sub-filas por wallet */}
      {expanded && row.wallets.map(w => {
        const wBreakEven = w.quantity > 0 ? w.costBasis / w.quantity : 0
        const wValue     = w.quantity * price
        const wPnl       = hasPrice ? wValue - w.costBasis : null
        const wPnlPct    = w.costBasis > 0 && wPnl !== null ? (wPnl / w.costBasis) * 100 : null
        const wDistPct   = wBreakEven > 0 && hasPrice ? ((price - wBreakEven) / wBreakEven) * 100 : null

        return (
          <tr key={w.wallet_id} className="bg-background-tertiary/20 border-l-2"
            style={{ borderLeftColor: w.wallet_color }}>
            <td className="pl-12 pr-4 py-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: w.wallet_color }} />
                <span className="text-xs text-gray-400">{w.wallet_name}</span>
              </div>
            </td>
            <td className="px-4 py-2 text-right mono text-xs text-gray-400">{formatAmount(w.quantity)}</td>
            <td className="px-4 py-2 text-right mono text-xs text-gray-600">—</td>
            {/* Break-even por wallet — oculto en compacto */}
            {!compact && (
              <td className="px-4 py-2 text-right">
                <div className="flex flex-col items-end gap-0.5">
                  <span className="mono text-xs text-gray-400">{fmtBreakEven(wBreakEven)}</span>
                  {wDistPct !== null && (
                    <span className={`text-[9px] font-semibold mono px-1 rounded-full ${
                      wDistPct >= 0 ? 'text-accent-green/80 bg-accent-green/8' : 'text-accent-red/80 bg-accent-red/8'
                    }`}>
                      {wDistPct >= 0 ? '▲' : '▼'} {Math.abs(wDistPct).toFixed(1)}%
                    </span>
                  )}
                </div>
              </td>
            )}
            <td className="px-4 py-2 text-right mono text-xs">
              {hasPrice ? <span className="text-gray-300">{formatEur(wValue)}</span> : <span className="text-gray-600">—</span>}
            </td>
            {/* Coste base por wallet — oculto en compacto */}
            {!compact && <td className="px-4 py-2 text-right mono text-xs text-gray-500">{formatEur(w.costBasis)}</td>}
            {/* P&L € sub-wallet — oculto en compacto */}
            {!compact && (
              <td className={`px-4 py-2 text-right mono text-xs ${wPnl !== null ? pnlColor(wPnl) : 'text-gray-600'}`}>
                {wPnl !== null ? (wPnl >= 0 ? '+' : '') + formatEur(wPnl) : '—'}
              </td>
            )}
            <td className={`px-4 py-2 text-right mono text-xs ${wPnlPct !== null ? pnlColor(wPnlPct) : 'text-gray-600'}`}>
              {wPnlPct !== null ? (wPnlPct >= 0 ? '+' : '') + wPnlPct.toFixed(2) + '%' : '—'}
            </td>
            {/* % cartera — por sub-wallet */}
            <td className="px-4 py-2 text-right">
              {hasPrice && totalPortfolioValue > 0 ? (
                <span className="text-[10px] mono text-gray-600">
                  {((wValue / totalPortfolioValue) * 100).toFixed(1)}%
                </span>
              ) : <span className="text-gray-700 text-xs">—</span>}
            </td>
          </tr>
        )
      })}
    </>
  )
}

// ── Fila fiat ─────────────────────────────────────────────────────────────

const FIAT_SYMBOLS: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', CHF: '₣' }

function FiatRowComponent({ row, totalPortfolioValue, compact = false }: { row: FiatRow; totalPortfolioValue: number; compact?: boolean }) {
  const symbol = FIAT_SYMBOLS[row.asset] ?? row.asset[0]

  return (
    <tr className="hover:bg-background-tertiary/30 transition-colors">
      <td className="px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="w-4 shrink-0" />
          <div className="w-7 h-7 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 ring-1 ring-emerald-500/30 overflow-hidden">
            <span className="text-sm font-bold text-emerald-400">{symbol}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.asset}</span>
            <span className="text-[10px] font-semibold tracking-widest text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded uppercase">
              FIAT
            </span>
          </div>
        </div>
      </td>
      <td className={`px-4 ${compact ? 'py-1.5' : 'py-3'} text-right mono text-gray-300`}>{formatEur(row.value)}</td>
      <td className={`px-4 ${compact ? 'py-1.5' : 'py-3'} text-right mono text-gray-500`}>{formatPrice(1)}</td>
      {!compact && <td className="px-4 py-3 text-right mono text-gray-600">—</td>}
      <td className={`px-4 ${compact ? 'py-1.5' : 'py-3'} text-right mono font-medium text-white`}>{formatEur(row.value)}</td>
      {!compact && <td className="px-4 py-3 text-right mono text-gray-600">—</td>}
      {!compact && <td className="px-4 py-3 text-right mono text-gray-600">—</td>}
      <td className={`px-4 ${compact ? 'py-1.5' : 'py-3'} text-right mono text-gray-600`}>—</td>
      {/* % cartera fiat */}
      <td className={`px-4 ${compact ? 'py-1.5' : 'py-3'}`}>
        {totalPortfolioValue > 0 ? (
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs mono text-gray-400">
              {((row.value / totalPortfolioValue) * 100).toFixed(1)}%
            </span>
            <div className="w-16 h-1 bg-background-tertiary rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500/50 transition-all duration-500"
                style={{ width: `${Math.min((row.value / totalPortfolioValue) * 100, 100)}%` }}
              />
            </div>
          </div>
        ) : <span className="text-gray-700 text-xs">—</span>}
      </td>
    </tr>
  )
}

// ── Tabla principal ────────────────────────────────────────────────────────

const DUST_THRESHOLD = 1

type SortKey = 'asset' | 'quantity' | 'price' | 'breakeven' | 'value' | 'cost' | 'pnl' | 'pnlpct' | 'weight'
type SortDir = 'asc' | 'desc'

function sortRows(rows: UnifiedRow[], key: SortKey, dir: SortDir, prices: Record<string, number>, total: number): UnifiedRow[] {
  return [...rows].sort((a, b) => {
    let va = 0, vb = 0
    if (key === 'asset') {
      const cmp = a.asset.localeCompare(b.asset)
      return dir === 'asc' ? cmp : -cmp
    }
    if (key === 'quantity') {
      va = a.kind === 'crypto' ? a.totalQuantity : 0
      vb = b.kind === 'crypto' ? b.totalQuantity : 0
    } else if (key === 'price') {
      va = a.kind === 'crypto' ? (prices[a.asset] ?? 0) : 1
      vb = b.kind === 'crypto' ? (prices[b.asset] ?? 0) : 1
    } else if (key === 'breakeven') {
      va = a.kind === 'crypto' && a.totalQuantity > 0 ? a.totalCostBasis / a.totalQuantity : 0
      vb = b.kind === 'crypto' && b.totalQuantity > 0 ? b.totalCostBasis / b.totalQuantity : 0
    } else if (key === 'value') {
      va = a.value; vb = b.value
    } else if (key === 'cost') {
      va = a.kind === 'crypto' ? a.totalCostBasis : 0
      vb = b.kind === 'crypto' ? b.totalCostBasis : 0
    } else if (key === 'pnl') {
      const priceA = a.kind === 'crypto' ? (prices[a.asset] ?? 0) : 0
      const priceB = b.kind === 'crypto' ? (prices[b.asset] ?? 0) : 0
      va = priceA > 0 && a.kind === 'crypto' ? a.value - a.totalCostBasis : -Infinity
      vb = priceB > 0 && b.kind === 'crypto' ? b.value - b.totalCostBasis : -Infinity
    } else if (key === 'pnlpct') {
      const priceA = a.kind === 'crypto' ? (prices[a.asset] ?? 0) : 0
      const priceB = b.kind === 'crypto' ? (prices[b.asset] ?? 0) : 0
      va = priceA > 0 && a.kind === 'crypto' && a.totalCostBasis > 0 ? ((a.value - a.totalCostBasis) / a.totalCostBasis) * 100 : -Infinity
      vb = priceB > 0 && b.kind === 'crypto' && b.totalCostBasis > 0 ? ((b.value - b.totalCostBasis) / b.totalCostBasis) * 100 : -Infinity
    } else if (key === 'weight') {
      va = total > 0 ? (a.value / total) * 100 : 0
      vb = total > 0 ? (b.value / total) * 100 : 0
    }
    return dir === 'asc' ? va - vb : vb - va
  })
}

export function AssetTable({ lots, fiatBalances = [] }: AssetTableProps) {
  const prices   = usePricesStore(s => s.prices)
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

  const sortedMain = useMemo(
    () => sortRows(mainRows, sortKey, sortDir, prices, totalValue),
    [mainRows, sortKey, sortDir, prices, totalValue]   // eslint-disable-line
  )
  const sortedDust = useMemo(
    () => sortRows(dustRows, sortKey, sortDir, prices, totalValue),
    [dustRows, sortKey, sortDir, prices, totalValue]   // eslint-disable-line
  )

  // Componente de cabecera ordenable
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
        {!compact && <SortTh label="Break-even" sk="breakeven" title="Precio de equilibrio" />}
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
      : <CryptoRowComponent key={row.asset} row={row} prices={prices} totalPortfolioValue={totalValue} compact={compact} />

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
