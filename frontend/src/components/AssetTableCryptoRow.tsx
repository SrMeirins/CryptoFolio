import { Fragment, useState } from 'react'
import { ChevronDown, ChevronRight, Settings, Calculator, Lock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { type LockedAmount } from '../api/portfolio'
import { formatMoney, formatPrice, formatAmount, pnlColor } from '../utils/format'
import { useCurrency } from '../hooks/useDisplayCurrency'
import { type CryptoRow, walletShortName } from '../utils/assetTable'
import { CryptoIcon } from './CryptoIcon'
import { T, alpha, ink } from '../utils/colors'
import { iconButtonClasses, tableRowClasses } from './ui'

export function CryptoRowComponent({ row, prices, yesterdayPrices, totalPortfolioValue, compact = false, onSimulate, lockedAmounts = [] }: {
  row: CryptoRow
  prices: Record<string, number>
  yesterdayPrices: Record<string, number>
  totalPortfolioValue: number
  compact?: boolean
  onSimulate?: (asset: string, qty: number) => void
  lockedAmounts?: LockedAmount[]
}) {
  const currency = useCurrency()
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
        className={tableRowClasses(canExpand, expanded)}
        onClick={() => canExpand && setExpanded(e => !e)}
      >
        {/* Activo */}
        <td className="px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="w-4 shrink-0 flex items-center justify-center">
              {canExpand
                ? expanded
                  ? <ChevronDown size={12} className="text-fg-subtle" />
                  : <ChevronRight size={12} className="text-fg-subtle" />
                : <span className="w-3" />
              }
            </div>
            <CryptoIcon symbol={row.asset} size={28} />
            <span className="font-medium">{row.asset}</span>
            {!expanded && (
              <div className="flex gap-1 ml-1 flex-wrap">
                {row.wallets.map(w => (
                  <span key={w.wallet_id}
                    className="text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap"
                    style={{ backgroundColor: `${alpha(w.wallet_color, 9)}`, color: ink(w.wallet_color) }}>
                    {walletShortName(w.wallet_name, w.wallet_kind)}
                  </span>
                ))}
                {lockedAmounts.length > 0 && (() => {
                  const onlyLaunchpool = lockedAmounts.every(l => l.lock_kind === 'launchpool')
                  return (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5 ${onlyLaunchpool ? 'bg-accent-purple/10 text-accent-purple' : 'bg-warning/10 text-warning'}`}>
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
                onClick={e => { e.stopPropagation(); onSimulate(row.asset, row.totalQuantity) }}
                className={iconButtonClasses('sm', false, 'ml-auto', 'brand')}
                title="Simular venta"
              >
                <Calculator size={13} />
              </button>
            )}
          </div>
        </td>

        {/* Cantidad */}
        <td className={`px-4 ${compact ? 'py-2' : 'py-3'} text-right mono text-fg`}>{formatAmount(row.totalQuantity)}</td>

        {/* Precio actual + 24h */}
        <td className={`px-4 ${compact ? 'py-1.5' : 'py-3'} text-right mono`}>
          {hasPrice ? (
            <div className="flex flex-col items-end gap-0.5">
              <span>{formatPrice(price, currency)}</span>
              {change24h !== null && (
                <span className={`text-xs font-semibold px-1.5 py-px rounded-full ${
                  change24h >= 0
                    ? 'text-positive bg-positive/10'
                    : 'text-negative bg-negative/10'
                }`}>
                  {change24h >= 0 ? '▲' : '▼'} {Math.abs(change24h).toFixed(2)}%
                </span>
              )}
            </div>
          ) : (
            <Link to="/settings?tab=assets"
              className="inline-flex items-center gap-1 text-xs text-warning/80 hover:text-warning bg-warning/8 border border-warning/20 px-2 py-0.5 rounded-lg transition-colors"
              title="Configura el par de precio en Settings → Activos"
            >
              <Settings size={10} />Sin precio
            </Link>
          )}
        </td>

        {/* Break-even — oculto en compacto */}
        {!compact && (
          <td className="px-4 py-3 text-right mono text-fg-muted">
            {breakEvenPrice !== null ? formatPrice(breakEvenPrice, currency) : <span className="text-fg-subtle">—</span>}
          </td>
        )}

        {/* Valor en la moneda de visualización */}
        <td className={`px-4 ${compact ? 'py-1.5' : 'py-3'} text-right mono font-medium`}>
          {hasPrice ? formatMoney(row.value, currency)
            : <span className="text-fg-subtle text-xs">—</span>}
        </td>

        {/* Coste base — oculto en compacto */}
        {!compact && (
          <td className="px-4 py-3 text-right mono text-fg-muted">{formatMoney(row.totalCostBasis, currency)}</td>
        )}

        {/* P&L € — oculto en compacto */}
        {!compact && (
          <td className={`px-4 py-3 text-right mono font-medium ${hasPrice ? pnlColor(pnl) : 'text-fg-subtle'}`}>
            {hasPrice ? (pnl >= 0 ? '+' : '') + formatMoney(pnl, currency) : '—'}
          </td>
        )}

        {/* P&L % */}
        <td className={`px-4 ${compact ? 'py-1.5' : 'py-3'} text-right mono text-sm ${hasPrice ? pnlColor(pnlPct) : 'text-fg-subtle'}`}>
          {hasPrice ? (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(2) + '%' : '—'}
        </td>

        {/* % Cartera */}
        <td className="px-4 py-3">
          {portfolioWeight !== null ? (
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs mono text-fg-muted">{portfolioWeight.toFixed(1)}%</span>
              <div className="w-16 h-1 bg-background-tertiary rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand/60 transition-all duration-500"
                  style={{ width: `${Math.min(portfolioWeight, 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <span className="text-fg-subtle text-xs">—</span>
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
                  <span className="text-xs text-fg-muted">{w.wallet_name}</span>
                </div>
              </td>
              <td className="px-4 py-2 text-right mono text-xs text-fg-muted">{formatAmount(w.quantity)}</td>
              <td className="px-4 py-2 text-right mono text-xs text-fg-subtle">—</td>
              {!compact && <td className="px-4 py-2 text-right mono text-xs text-fg-subtle">—</td>}
              <td className="px-4 py-2 text-right mono text-xs">
                {hasPrice ? <span className="text-fg">{formatMoney(wValue, currency)}</span> : <span className="text-fg-subtle">—</span>}
              </td>
              {!compact && <td className="px-4 py-2 text-right mono text-xs text-fg-subtle">{formatMoney(w.costBasis, currency)}</td>}
              {!compact && (
                <td className={`px-4 py-2 text-right mono text-xs ${wPnl !== null ? pnlColor(wPnl) : 'text-fg-subtle'}`}>
                  {wPnl !== null ? (wPnl >= 0 ? '+' : '') + formatMoney(wPnl, currency) : '—'}
                </td>
              )}
              <td className={`px-4 py-2 text-right mono text-xs ${wPnlPct !== null ? pnlColor(wPnlPct) : 'text-fg-subtle'}`}>
                {wPnlPct !== null ? (wPnlPct >= 0 ? '+' : '') + wPnlPct.toFixed(2) + '%' : '—'}
              </td>
              <td className="px-4 py-2 text-right">
                {hasPrice && totalPortfolioValue > 0 ? (
                  <span className="text-xs mono text-fg-subtle">
                    {((wValue / totalPortfolioValue) * 100).toFixed(1)}%
                  </span>
                ) : <span className="text-fg-subtle text-xs">—</span>}
              </td>
            </tr>
            {/* Sub-filas de staking bloqueado */}
            {wLocked.map((l, i) => {
              const isLaunchpool = l.lock_kind === 'launchpool'
              const clr = isLaunchpool ? { bg: alpha(T.purple, 3), border: alpha(T.purple, 30), icon: 'text-accent-purple/70', text: 'text-accent-purple/80', amount: 'text-accent-purple/70', label: 'text-accent-purple/50' }
                                       : { bg: alpha(T.warning, 3),  border: alpha(T.warning, 30),  icon: 'text-warning/70',  text: 'text-warning/80',  amount: 'text-warning/70',  label: 'text-warning/50'  }
              return (
                <tr key={`locked-${i}`} style={{ backgroundColor: clr.bg, borderLeft: `2px solid ${clr.border}` }}>
                  <td className="pl-16 pr-4 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <Lock size={10} className={`${clr.icon} shrink-0`} />
                      <span className={`text-xs ${clr.text}`}>{l.staking_type}</span>
                    </div>
                  </td>
                  <td className={`px-4 py-1.5 text-right mono text-xs ${clr.amount}`}>
                    {formatAmount(parseFloat(l.locked_amount))}
                  </td>
                  <td colSpan={compact ? 3 : 5} className={`px-4 py-1.5 text-xs ${clr.label} italic`}>
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
