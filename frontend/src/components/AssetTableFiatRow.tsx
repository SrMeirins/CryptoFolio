import { type FiatRow } from '../utils/assetTable'
import { formatAmount, formatMoney, formatPrice, formatPercent } from '../utils/format'
import { useCurrency } from '../hooks/useDisplayCurrency'
import { tableRowClasses } from './ui'

const FIAT_SYMBOLS: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', CHF: '₣' }

export function FiatRowComponent({ row, totalPortfolioValue, compact = false }: { row: FiatRow; totalPortfolioValue: number; compact?: boolean }) {
  const currency = useCurrency()
  const symbol = FIAT_SYMBOLS[row.asset] ?? row.asset[0]
  // Cantidad en la propia moneda del saldo (un saldo en EUR sigue siendo euros
  // aunque se muestre en USD); precio y valor, en la moneda de visualización.
  const quantityLabel = row.asset === 'EUR' || row.asset === 'USD'
    ? formatMoney(row.quantity, row.asset)
    : `${formatAmount(row.quantity, 2)} ${row.asset}`

  return (
    <tr className={tableRowClasses()}>
      <td className="px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="w-4 shrink-0" />
          <div className="w-7 h-7 rounded-full bg-positive/10 flex items-center justify-center shrink-0 ring-1 ring-emerald-500/30 overflow-hidden">
            <span className="text-sm font-bold text-positive">{symbol}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.asset}</span>
            <span className="text-[11px] font-semibold tracking-widest text-positive bg-positive/10 border border-positive/20 px-1.5 py-0.5 rounded-lg uppercase">
              FIAT
            </span>
          </div>
        </div>
      </td>
      <td className={`px-4 ${compact ? 'py-1.5' : 'py-3'} text-right mono text-fg`}>{quantityLabel}</td>
      <td className={`px-4 ${compact ? 'py-1.5' : 'py-3'} text-right mono text-fg-subtle`}>{formatPrice(row.price, currency)}</td>
      {!compact && <td className="px-4 py-3 text-right mono text-fg-subtle">—</td>}
      <td className={`px-4 ${compact ? 'py-1.5' : 'py-3'} text-right mono font-medium text-fg`}>{formatMoney(row.value, currency)}</td>
      {!compact && <td className="px-4 py-3 text-right mono text-fg-subtle">—</td>}
      {!compact && <td className="px-4 py-3 text-right mono text-fg-subtle">—</td>}
      <td className={`px-4 ${compact ? 'py-1.5' : 'py-3'} text-right mono text-fg-subtle`}>—</td>
      {/* % cartera fiat */}
      <td className={`px-4 ${compact ? 'py-1.5' : 'py-3'}`}>
        {totalPortfolioValue > 0 ? (
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs mono text-fg-muted">
              {formatPercent((row.value / totalPortfolioValue) * 100, 1)}
            </span>
            <div className="w-16 h-1 bg-background-tertiary rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-positive/50 transition-all duration-500"
                style={{ width: `${Math.min((row.value / totalPortfolioValue) * 100, 100)}%` }}
              />
            </div>
          </div>
        ) : <span className="text-fg-subtle text-xs">—</span>}
      </td>
    </tr>
  )
}
