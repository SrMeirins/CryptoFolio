import { type FiatRow } from '../utils/assetTable'
import { formatEur, formatPrice } from '../utils/format'

const FIAT_SYMBOLS: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', CHF: '₣' }

export function FiatRowComponent({ row, totalPortfolioValue, compact = false }: { row: FiatRow; totalPortfolioValue: number; compact?: boolean }) {
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
