import type { Transaction } from '../../api/portfolio'
import { CryptoIcon } from '../../components/CryptoIcon'
import { formatAmount, formatMoney, type Currency } from '../../utils/format'
import { toDisplayAmount, valuationHint } from './helpers'

/**
 * Detalle de comisiones de una fila (#371): desglose de las agrupadas con su
 * operación o, en una comisión suelta, la operación a la que pertenece.
 */
export function GroupedFeesDetail({ tx, currency }: { tx: Transaction; currency: Currency }) {
  if (tx.grouped_fees.length > 0) {
    return (
      <div className="col-span-2">
        <div className="text-[11px] text-fg-subtle uppercase tracking-widest mb-1">Comisiones de esta operación</div>
        <ul className="space-y-0.5">
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
        </ul>
      </div>
    )
  }
  if (tx.fee_parent_id) {
    return (
      <div className="col-span-2">
        <div className="text-[11px] text-fg-subtle uppercase tracking-widest mb-1">Comisión de</div>
        <div className="text-xs text-fg-muted">
          La compra o venta del mismo instante <span className="mono text-fg-subtle break-all">({tx.fee_parent_id})</span>
        </div>
      </div>
    )
  }
  return null
}
