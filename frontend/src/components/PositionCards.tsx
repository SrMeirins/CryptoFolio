import { useCurrency } from '../hooks/useDisplayCurrency'
import { formatAmount, formatMoney, formatPercent, formatPrice } from '../utils/format'
import { breakEvenDistance } from '../utils/portfolioView'
import type { RowMetrics } from '../utils/positionMetrics'
import type { UnifiedRow } from '../utils/assetTable'
import { CryptoIcon } from './CryptoIcon'
import { PnlPill } from './AssetTableCells'
import { SignedMoney } from './AssetTableMetricCells'

// Posiciones en móvil (#527): por debajo de 640 px la tabla no cabe sin
// desplazamiento lateral; cada activo pasa a una tarjeta con lo esencial
// (valor, P&L, cantidad y precio, y el break-even en palabras). El detalle
// completo sigue en el panel del activo.

export function PositionCards({ rows, prices, metrics, onOpen, keyOf }: {
  rows: readonly UnifiedRow[]
  prices: Readonly<Record<string, number>>
  metrics: ReadonlyMap<string, RowMetrics>
  onOpen?: (asset: string) => void
  keyOf: (row: UnifiedRow) => string
}) {
  const currency = useCurrency()
  return (
    <ul className="divide-y divide-border" aria-label="Posiciones">
      {rows.map(row => {
        const crypto = row.kind === 'crypto'
        const price = crypto ? prices[row.asset] ?? 0 : row.price
        const quantity = crypto ? row.totalQuantity : row.quantity
        const pnl = crypto && price > 0 ? row.value - row.totalCostBasis : null
        const pnlPct = crypto && pnl !== null && row.totalCostBasis > 0 ? (pnl / row.totalCostBasis) * 100 : null
        const avg = crypto && row.totalQuantity > 0 && row.totalCostBasis > 0 ? row.totalCostBasis / row.totalQuantity : null
        const be = avg !== null && price > 0 ? breakEvenDistance(price, avg) : null
        const resultado = crypto ? metrics.get(row.asset)?.resultado ?? null : null
        const body = (
          <>
            <div className="flex items-center gap-3">
              <CryptoIcon symbol={row.asset} size={28} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  {crypto && onOpen
                    ? <button type="button" onClick={() => onOpen(row.asset)} aria-label={`Ver detalle de ${row.asset}`}
                        className="font-medium text-fg rounded underline decoration-dotted decoration-fg-subtle/60 underline-offset-4 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 after:absolute after:inset-0">{row.asset}</button>
                    : <span className="font-medium text-fg">{row.asset}</span>}
                  <span className="mono font-semibold text-fg">{price > 0 || !crypto ? formatMoney(row.value, currency) : '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-fg-subtle">
                  <span className="mono truncate">{formatAmount(quantity)} × {price > 0 ? formatPrice(price, currency) : 'sin precio'}</span>
                  {pnl !== null && pnlPct !== null && <PnlPill pct={pnlPct} />}
                </div>
              </div>
            </div>
            {crypto && (pnl !== null || avg !== null) && (
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs pl-10">
                {pnl !== null && (<><dt className="text-fg-subtle">P&L</dt><dd className="text-right mono"><SignedMoney value={pnl} currency={currency} /></dd></>)}
                {resultado !== null && (<><dt className="text-fg-subtle">Resultado total</dt><dd className="text-right mono"><SignedMoney value={resultado} currency={currency} /></dd></>)}
                {avg !== null && (
                  <>
                    <dt className="text-fg-subtle">Precio medio</dt>
                    <dd className="text-right mono text-fg-muted">
                      {formatPrice(avg, currency)}
                      {be && <span className={`block ${be.pct >= 0 ? 'text-positive-ink' : 'text-negative-ink'}`}>
                        {be.pct >= 0 ? `${formatPercent(be.pct, 1, true)} sobre coste` : `falta ${formatPercent(be.toRecover, 1, true)}`}
                      </span>}
                    </dd>
                  </>
                )}
              </dl>
            )}
          </>
        )
        return (
          // Toda la tarjeta abre el detalle: el botón del nombre se extiende con after:inset-0.
          <li key={keyOf(row)} data-row-key={keyOf(row)} className={`relative px-4 py-3 ${crypto && onOpen ? 'hover:bg-overlay/4' : ''}`}>
            {body}
          </li>
        )
      })}
    </ul>
  )
}
