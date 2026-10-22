import { type FiatRow } from '../utils/assetTable'
import { formatAmount, formatMoney, formatPrice } from '../utils/format'
import { useCurrency } from '../hooks/useDisplayCurrency'
import { tableRowClasses } from './ui'
import { CryptoIcon } from './CryptoIcon'
import { WeightCell } from './AssetTableCells'

export function FiatRowComponent({ row, totalPortfolioValue, compact = false, rowKey }: { row: FiatRow; totalPortfolioValue: number; compact?: boolean; rowKey?: string }) {
  const currency = useCurrency()
  // Cantidad en la propia moneda del saldo (un saldo en EUR sigue siendo euros
  // aunque se muestre en USD); precio y valor, en la moneda de visualización.
  const quantityLabel = row.asset === 'EUR' || row.asset === 'USD'
    ? formatMoney(row.quantity, row.asset)
    : `${formatAmount(row.quantity, 2)} ${row.asset}`

  const pad = compact ? 'py-1.5' : 'py-3'
  return (
    <tr data-row-key={rowKey} className={tableRowClasses()}>
      <td className={`px-5 ${pad}`}>
        <div className="flex items-center gap-2">
          <span className="w-4 shrink-0" />
          {/* Bandera de la moneda (#246), como el resto de iconos de la app. */}
          <CryptoIcon symbol={row.asset} size={compact ? 22 : 28} />
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.asset}</span>
            <span className="text-[11px] font-semibold tracking-widest text-positive-ink bg-positive/10 border border-positive/20 px-1.5 py-0.5 rounded-lg uppercase">
              FIAT
            </span>
          </div>
        </div>
      </td>
      <td className={`px-4 ${pad} text-right mono text-fg`}>{quantityLabel}</td>
      <td className={`px-4 ${pad} text-right mono text-fg-subtle`}>{formatPrice(row.price, currency)}</td>
      <td className={`px-2 ${pad} text-right text-fg-subtle text-xs`}>—</td>
      <td className={`px-4 ${pad} text-right mono font-semibold text-fg`}>{formatMoney(row.value, currency)}</td>
      {/* Sin P&L ni break-even: es efectivo */}
      <td className={`px-4 ${pad} text-right mono text-fg-subtle`}>—</td>
      {!compact && <td className={`px-4 ${pad} text-right mono text-fg-subtle`}>—</td>}
      <td className={`px-4 ${pad}`}>
        <WeightCell pct={totalPortfolioValue > 0 ? (row.value / totalPortfolioValue) * 100 : null} tone="bg-positive/50" />
      </td>
    </tr>
  )
}
