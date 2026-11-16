import type { ReactNode } from 'react'
import { valueIndex, type ColumnDef } from '../utils/portfolioColumns'
import { type FiatRow } from '../utils/assetTable'
import { formatAmount, formatMoney, formatPrice } from '../utils/format'
import { useCurrency } from '../hooks/useDisplayCurrency'
import { tableRowClasses } from './ui'
import { CryptoIcon } from './CryptoIcon'
import { WeightCell } from './AssetTableCells'

export function FiatRowComponent({ row, columns, showQty = true, totalPortfolioValue, compact = false, rowKey }: {
  row: FiatRow; columns: readonly ColumnDef[]; showQty?: boolean; totalPortfolioValue: number; compact?: boolean; rowKey?: string
}) {
  const currency = useCurrency()
  // Cantidad en la propia moneda del saldo (un saldo en EUR sigue siendo euros
  // aunque se muestre en USD); precio y valor, en la moneda de visualización.
  const quantityLabel = row.asset === 'EUR' || row.asset === 'USD'
    ? formatMoney(row.quantity, row.asset)
    : `${formatAmount(row.quantity, 2)} ${row.asset}`

  const pad = compact ? 'py-1.5' : 'py-3'
  const valueAt = valueIndex(columns)
  const valueCell = <td key="valor" className={`px-2.5 ${pad} text-right mono font-semibold text-fg whitespace-nowrap`}>{formatMoney(row.value, currency)}</td>
  return (
    <tr data-row-key={rowKey} className={tableRowClasses()}>
      <td className={`pl-4 pr-2.5 ${pad}`}>
        <div className="flex items-center gap-2">
          <span className="w-4 shrink-0" />
          {/* Bandera de la moneda (#246), como el resto de iconos de la app. */}
          <CryptoIcon symbol={row.asset} size={compact ? 22 : 28} />
          <div className="flex flex-col items-start">
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.asset}</span>
            <span className="text-[11px] font-semibold tracking-widest text-positive-ink bg-positive/10 border border-positive/20 px-1.5 py-0.5 rounded-lg uppercase">
              FIAT
            </span>
          </div>
          {showQty && <span className="text-[11px] leading-tight mono text-fg-subtle whitespace-nowrap">{quantityLabel}</span>}
          </div>
        </div>
      </td>
      {columns.map(col => {
        const td = (content: ReactNode, cls = 'px-2.5 text-right mono text-fg-subtle whitespace-nowrap') => <td key={col.key} className={`${cls} ${pad}`}>{content}</td>
        switch (col.key) {
          case 'precio': return td(formatPrice(row.price, currency))
          case 'tendencia': return td('—', 'px-2 text-right text-fg-subtle text-xs')
          case 'peso': return td(<WeightCell pct={totalPortfolioValue > 0 ? (row.value / totalPortfolioValue) * 100 : null} tone="bg-positive/50" />, 'px-2.5')
          // Sin coste, P&L ni break-even: es efectivo
          default: return td('—')
        }
      }).flatMap((cell, i) => i === valueAt ? [valueCell, cell] : [cell])}
      {valueAt === columns.length && valueCell}
    </tr>
  )
}
