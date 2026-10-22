import type { Transaction } from '../../api/portfolio'
import { CryptoIcon } from '../../components/CryptoIcon'
import { formatAmount, formatMoney, type Currency } from '../../utils/format'
import { feeSummary } from './helpers'

/**
 * Celda «Fee» del Historial (#371): la comisión propia de la operación y, con
 * comisiones agrupadas, su total en la moneda de visualización y «+N
 * comisiones». El desglose está en el detalle de la fila.
 */
export function FeeCell({ tx, currency }: { tx: Transaction; currency: Currency }) {
  const s = feeSummary(tx, currency)
  if (s.count === 0) return <span className="text-fg-subtle text-xs">—</span>
  const grouped = tx.grouped_fees.length
  const own = !!(tx.fee_asset && tx.fee_amount && Number(tx.fee_amount) > 0)
  const hint = s.missing > 0 ? `${s.missing} sin precio` : s.estimated ? 'incluye valores estimados' : null
  return (
    <div className="flex items-center gap-1.5">
      {own && <CryptoIcon symbol={tx.fee_asset!} size={14} />}
      <div>
        {own && (
          <div className="text-xs mono text-fg-muted">
            {formatAmount(tx.fee_amount!, 6)} <span className="text-fg-subtle text-xs">{tx.fee_asset}</span>
          </div>
        )}
        {s.total !== null && (
          <div className="text-xs text-fg-subtle mono" title={hint ?? undefined}>
            {s.estimated && <span aria-hidden="true">≈ </span>}{formatMoney(s.total, currency)}
            {hint && <span className="sr-only"> ({hint})</span>}
          </div>
        )}
        {grouped > 0 && (
          <div className="text-[11px] text-fg-subtle">+{grouped} {grouped === 1 ? 'comisión' : 'comisiones'}</div>
        )}
      </div>
    </div>
  )
}
