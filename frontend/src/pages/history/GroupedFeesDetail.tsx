import type { Transaction } from '../../api/portfolio'
import { CryptoIcon } from '../../components/CryptoIcon'
import { formatAmount, formatMoney, type Currency } from '../../utils/format'
import { toDisplayAmount, valuationHint } from './helpers'

/**
 * Detalle de comisiones (#371), como grupo de una lista de definiciones del
 * panel de detalle (#373): desglose de las agrupadas con su operación o, en
 * una comisión suelta, la operación a la que pertenece, que abre su detalle.
 */
export function GroupedFeesDetail({ tx, currency, onOpen }: { tx: Transaction; currency: Currency; onOpen: (id: string) => void }) {
  if (tx.grouped_fees.length > 0) {
    return (
      <div className="col-span-2">
        <dt className="text-fg-subtle">Comisiones de esta operación</dt>
        <dd><ul className="space-y-0.5">
          {tx.grouped_fees.map(f => {
            const v = toDisplayAmount(f.value_eur, tx, currency)
            const hint = valuationHint(f.value_source)
            return (
              <li key={f.id} className="flex items-center gap-1.5 text-xs">
                <CryptoIcon symbol={f.asset} size={12} />
                <span className="mono text-fg-muted">{formatAmount(f.amount, 8)} {f.asset}</span>
                <span className="mono text-fg-subtle" title={hint ?? undefined}>
                  · {v === null ? '—' : `${f.value_source === 'estimado' ? '≈ ' : ''}${formatMoney(v, currency)}`}
                  {hint && <span className="sr-only"> ({hint})</span>}
                </span>
              </li>
            )
          })}
        </ul></dd>
      </div>
    )
  }
  if (tx.fee_parent_id) {
    return (
      <div className="col-span-2">
        <dt className="text-fg-subtle">Comisión de</dt>
        <dd><button type="button" onClick={() => onOpen(tx.fee_parent_id!)}
          className="text-left text-brand-ink hover:underline rounded focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
          La compra o venta del mismo instante
        </button></dd>
      </div>
    )
  }
  return null
}
