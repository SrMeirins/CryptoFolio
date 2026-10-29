import type { Transaction } from '../../api/portfolio'
import { CryptoIcon } from '../../components/CryptoIcon'
import { formatAmount, formatMoney, type Currency } from '../../utils/format'
import { feeSummary } from './helpers'

/**
 * Celda «Fee» del Historial (#371): la comisión propia de la operación y, con
 * comisiones agrupadas, su total en la moneda de visualización y «+N
 * comisiones». El desglose está en el detalle de la fila. En una entrada desde
 * otra wallet propia (#395) se atenúa: la pagó la wallet de origen.
 */
export function FeeCell({ tx, currency, paidElsewhere = false, verbose = false }: {
  tx: Transaction; currency: Currency; paidElsewhere?: boolean
  /** Texto largo («incluida en el coste») para el panel de detalle (#415). */
  verbose?: boolean
}) {
  const s = feeSummary(tx, currency)
  const included = Number(tx.included_fee_amount ?? 0)
  // Comisión dentro del precio (#431): el exchange no la desglosa; se dice, sin cifra.
  if (s.count === 0 && included <= 0 && tx.fee_in_price) {
    return (
      <span className="text-xs text-fg-subtle" title={`${tx.fee_in_price}: el exchange no desglosa la comisión`}>
        {verbose ? `Incluida en el precio (${tx.fee_in_price}); el exchange no la desglosa` : 'en el precio'}
      </span>
    )
  }
  if (s.count === 0 && included <= 0) return <span className="text-fg-subtle text-xs">—</span>
  // Incluida en el coste por el exchange (#415): se ve, atenuada, pero no se suma otra vez.
  const includedLine = included > 0 && tx.included_fee_asset && (
    <div className="text-xs text-fg-subtle mono">
      {tx.included_fee_asset === 'EUR' && currency === 'EUR' ? formatMoney(included, 'EUR') : `${formatAmount(included, 6)} ${tx.included_fee_asset}`}
      <span className="font-sans"> · {verbose ? 'incluida en el coste' : 'en el coste'}</span>
    </div>
  )
  if (s.count === 0) return includedLine
  const grouped = tx.grouped_fees.length
  const own = !!(tx.fee_asset && tx.fee_amount && Number(tx.fee_amount) > 0)
  const hint = s.missing > 0 ? `${s.missing} sin precio` : s.estimated ? 'incluye valores estimados' : null
  return (
    <div className="flex items-center gap-1.5">
      {own && <CryptoIcon symbol={tx.fee_asset!} size={14} />}
      <div>
        {own && (
          <div className={`text-xs mono ${paidElsewhere ? 'text-fg-subtle' : 'text-fg-muted'}`}>
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
        {paidElsewhere && <div className="text-[11px] text-fg-subtle">pagada en origen</div>}
        {includedLine}
      </div>
    </div>
  )
}
