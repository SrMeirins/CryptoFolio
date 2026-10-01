import { Fragment, useState } from 'react'
import { ChevronDown, ChevronRight, Settings, Calculator, Lock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { type LockedAmount } from '../api/portfolio'
import { formatEur, formatPrice, formatAmount, pnlColor } from '../utils/format'
import { type CryptoRow, walletShortName } from '../utils/assetTable'
import { CryptoIcon } from './CryptoIcon'

export function CryptoRowComponent({ row, prices, yesterdayPrices, totalPortfolioValue, compact = false, onSimulate, lockedAmounts = [] }: {
  row: CryptoRow
  prices: Record<string, number>
  yesterdayPrices: Record<string, number>
  totalPortfolioValue: number
  compact?: boolean
  onSimulate?: (asset: string, qty: number, price: number) => void
  lockedAmounts?: LockedAmount[]
}) {
  const [expanded, setExpanded] = useState(false)
  const price      = prices[row.asset] ?? 0
  const pnl        = row.value - row.totalCostBasis
  const pnlPct     = row.totalCostBasis > 0 ? (pnl / row.totalCostBasis) * 100 : 0
  const hasPrice   = price > 0
  const canExpand  = row.wallets.length > 1 || lockedAmounts.length > 0

  // 24h change
  const ydayPrice   = yesterdayPrices[row.asset]
  const change24h   = hasPrice && ydayPrice && ydayPrice > 0
    ? ((price - ydayPrice) / ydayPrice) * 100
    : null

  // Break-even: precio al que vendiendo todo recuperas exactamente lo invertido
  const breakEvenPrice = row.totalQuantity > 0 ? row.totalCostBasis / row.totalQuantity : null

  // Peso sobre el portfolio total
  const portfolioWeight = hasPrice && totalPortfolioValue > 0
    ? (row.value / totalPortfolioValue) * 100
    : null

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
              <div className="flex gap-1 ml-1 flex-wrap">
                {row.wallets.map(w => (
                  <span key={w.wallet_id}
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                    style={{ backgroundColor: `${w.wallet_color}18`, color: w.wallet_color }}>
                    {walletShortName(w.wallet_name, w.wallet_kind)}
                  </span>
                ))}
                {lockedAmounts.length > 0 && (() => {
                  const onlyLaunchpool = lockedAmounts.every(l => l.lock_kind === 'launchpool')
                  return (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5 ${onlyLaunchpool ? 'bg-violet-500/10 text-violet-400' : 'bg-amber-500/10 text-amber-400'}`}>
                      <Lock size={8} />
                      {formatAmount(lockedAmounts.reduce((s, l) => s + parseFloat(l.locked_amount), 0))}
                    </span>
                  )
                })()}
              </div>
            )}
            {onSimulate && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onSimulate(row.asset, row.totalQuantity, prices[row.asset] ?? 0) }}
                className="ml-auto p-1 text-gray-600 hover:text-accent-blue hover:bg-accent-blue/10 rounded-md transition-colors shrink-0"
                title="Simular venta"
              >
                <Calculator size={13} />
              </button>
            )}
          </div>
        </td>

        {/* Cantidad */}
        <td className={`px-4 ${compact ? 'py-2' : 'py-3'} text-right mono text-gray-300`}>{formatAmount(row.totalQuantity)}</td>

        {/* Precio actual + 24h */}
        <td className={`px-4 ${compact ? 'py-1.5' : 'py-3'} text-right mono`}>
          {hasPrice ? (
            <div className="flex flex-col items-end gap-0.5">
              <span>{formatPrice(price)}</span>
              {change24h !== null && (
                <span className={`text-[10px] font-semibold px-1.5 py-px rounded-full ${
                  change24h >= 0
                    ? 'text-accent-green bg-accent-green/10'
                    : 'text-accent-red bg-accent-red/10'
                }`}>
                  {change24h >= 0 ? '▲' : '▼'} {Math.abs(change24h).toFixed(2)}%
                </span>
              )}
            </div>
          ) : (
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
          <td className="px-4 py-3 text-right mono text-gray-400">
            {breakEvenPrice !== null ? formatPrice(breakEvenPrice) : <span className="text-gray-600">—</span>}
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
        const wValue     = w.quantity * price
        const wPnl       = hasPrice ? wValue - w.costBasis : null
        const wPnlPct    = w.costBasis > 0 && wPnl !== null ? (wPnl / w.costBasis) * 100 : null
        const wLocked    = lockedAmounts.filter(l => l.wallet_id === w.wallet_id)

        return (
          // key en el Fragment, no solo en el <tr> interno: antes faltaba
          // por completo (React avisaba en consola de "key" ausente en esta
          // lista), con riesgo real de reconciliación incorrecta entre
          // wallets al expandir/colapsar o cambiar de activo.
          <Fragment key={w.wallet_id}>
            <tr className="bg-background-tertiary/20 border-l-2"
              style={{ borderLeftColor: w.wallet_color }}>
              <td className="pl-12 pr-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: w.wallet_color }} />
                  <span className="text-xs text-gray-400">{w.wallet_name}</span>
                </div>
              </td>
              <td className="px-4 py-2 text-right mono text-xs text-gray-400">{formatAmount(w.quantity)}</td>
              <td className="px-4 py-2 text-right mono text-xs text-gray-600">—</td>
              {!compact && <td className="px-4 py-2 text-right mono text-xs text-gray-600">—</td>}
              <td className="px-4 py-2 text-right mono text-xs">
                {hasPrice ? <span className="text-gray-300">{formatEur(wValue)}</span> : <span className="text-gray-600">—</span>}
              </td>
              {!compact && <td className="px-4 py-2 text-right mono text-xs text-gray-500">{formatEur(w.costBasis)}</td>}
              {!compact && (
                <td className={`px-4 py-2 text-right mono text-xs ${wPnl !== null ? pnlColor(wPnl) : 'text-gray-600'}`}>
                  {wPnl !== null ? (wPnl >= 0 ? '+' : '') + formatEur(wPnl) : '—'}
                </td>
              )}
              <td className={`px-4 py-2 text-right mono text-xs ${wPnlPct !== null ? pnlColor(wPnlPct) : 'text-gray-600'}`}>
                {wPnlPct !== null ? (wPnlPct >= 0 ? '+' : '') + wPnlPct.toFixed(2) + '%' : '—'}
              </td>
              <td className="px-4 py-2 text-right">
                {hasPrice && totalPortfolioValue > 0 ? (
                  <span className="text-[10px] mono text-gray-600">
                    {((wValue / totalPortfolioValue) * 100).toFixed(1)}%
                  </span>
                ) : <span className="text-gray-700 text-xs">—</span>}
              </td>
            </tr>
            {/* Sub-filas de staking bloqueado */}
            {wLocked.map((l, i) => {
              const isLaunchpool = l.lock_kind === 'launchpool'
              const clr = isLaunchpool ? { bg: 'rgba(139,92,246,0.03)', border: 'rgba(139,92,246,0.3)', icon: 'text-violet-500/70', text: 'text-violet-400/80', amount: 'text-violet-400/70', label: 'text-violet-500/50' }
                                       : { bg: 'rgba(245,158,11,0.03)',  border: 'rgba(245,158,11,0.3)',  icon: 'text-amber-500/70',  text: 'text-amber-400/80',  amount: 'text-amber-400/70',  label: 'text-amber-500/50'  }
              return (
                <tr key={`locked-${i}`} style={{ backgroundColor: clr.bg, borderLeft: `2px solid ${clr.border}` }}>
                  <td className="pl-16 pr-4 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <Lock size={10} className={`${clr.icon} shrink-0`} />
                      <span className={`text-[11px] ${clr.text}`}>{l.staking_type}</span>
                    </div>
                  </td>
                  <td className={`px-4 py-1.5 text-right mono text-[11px] ${clr.amount}`}>
                    {formatAmount(parseFloat(l.locked_amount))}
                  </td>
                  <td colSpan={compact ? 3 : 5} className={`px-4 py-1.5 text-[10px] ${clr.label} italic`}>
                    {isLaunchpool ? 'bloqueado en launchpool' : 'bloqueado en staking'}
                  </td>
                </tr>
              )
            })}
          </Fragment>
        )
      })}
    </>
  )
}
