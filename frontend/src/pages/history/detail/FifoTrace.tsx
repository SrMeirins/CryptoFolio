import type { TransactionDetail } from '../../../api/portfolio'
import { OP_META } from '../../../constants/operations'
import { formatAmount, formatMoney } from '../../../utils/format'
import { fmtDate } from '../helpers'

// Trazabilidad FIFO de una transacción (#373), en EUR como Fiscal: de dónde
// salen sus unidades (lotes que consume) y adónde van (lotes que abre y qué
// operaciones los consumieron). Cada operación relacionada abre su detalle.

const label = (op: string) => OP_META[op]?.label ?? op
const signed = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${formatMoney(v, 'EUR')}`)
const tone = (v: number | null) => (v === null || v === 0 ? 'text-fg-muted' : v > 0 ? 'text-positive' : 'text-negative')

function OpLink({ id, op, at, onOpen }: { id: string; op: string; at: string; onOpen: (id: string) => void }) {
  const { date, time } = fmtDate(at)
  return (
    <button type="button" onClick={() => onOpen(id)}
      className="text-left text-brand-ink hover:underline rounded focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
      {label(op)} · {date} {time}
    </button>
  )
}

export function FifoTrace({ fifo, onOpen }: { fifo: TransactionDetail['fifo']; onOpen: (id: string) => void }) {
  if (fifo.consumed.length === 0 && fifo.opened.length === 0) {
    return <p className="text-xs text-fg-subtle">Esta operación no mueve lotes FIFO (p. ej. un depósito o una retirada de euros).</p>
  }
  const fiscal = fifo.consumed.some(c => c.fiscal_event_type !== 'NONE')
  return (
    <div className="space-y-4">
      {fifo.consumed.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-fg-muted mb-1.5">De dónde salen las unidades</h4>
          <ul className="space-y-1.5">
            {fifo.consumed.map(c => (
              <li key={c.id} className="rounded-lg border border-border px-3 py-2 text-xs">
                <div className="flex justify-between gap-2">
                  <OpLink id={c.origin.id} op={c.origin.operation_type} at={c.origin.timestamp} onOpen={onOpen} />
                  <span className="mono text-fg-muted">{formatAmount(c.quantity ?? 0, 8)} {c.asset}</span>
                </div>
                <div className="flex justify-between gap-2 mt-1 text-fg-subtle">
                  <span>{c.wallet_name}{c.fiscal_event_type === 'NONE' ? ' · sin efecto fiscal' : ''}</span>
                  <span className="mono">
                    coste {formatMoney(c.cost_eur ?? 0, 'EUR')}
                    {c.fiscal_event_type !== 'NONE' && <> · <span className={tone(c.gain_loss_eur)}>{signed(c.gain_loss_eur)}</span></>}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {fiscal && (
            <p className="mt-2 text-xs text-fg-muted mono">
              Coste {formatMoney(fifo.totals.cost_eur, 'EUR')} · Valor de transmisión {formatMoney(fifo.totals.proceeds_eur, 'EUR')} ·{' '}
              <span className={`font-semibold ${tone(fifo.totals.gain_loss_eur)}`}>{signed(fifo.totals.gain_loss_eur)}</span>
            </p>
          )}
        </div>
      )}
      {fifo.opened.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-fg-muted mb-1.5">Adónde van las unidades</h4>
          <ul className="space-y-1.5">
            {fifo.opened.map(l => (
              <li key={l.id} className="rounded-lg border border-border px-3 py-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-fg">Lote de {formatAmount(l.quantity_original ?? 0, 8)} {l.asset} · {l.wallet_name}</span>
                  <span className="mono text-fg-muted">{l.is_closed ? 'cerrado' : `quedan ${formatAmount(l.quantity_remaining ?? 0, 8)}`}</span>
                </div>
                {l.consumed_by.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 border-l border-border pl-2">
                    {l.consumed_by.map(c => (
                      <li key={`${c.transaction_id}-${c.timestamp}`} className="flex justify-between gap-2">
                        <OpLink id={c.transaction_id} op={c.operation_type} at={c.timestamp} onOpen={onOpen} />
                        <span className="mono text-fg-subtle">
                          {formatAmount(c.quantity ?? 0, 8)}
                          {c.fiscal_event_type !== 'NONE' && <> · <span className={tone(c.gain_loss_eur)}>{signed(c.gain_loss_eur)}</span></>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
