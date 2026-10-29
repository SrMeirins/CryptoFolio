import type { TransactionDetail } from '../../../api/portfolio'
import { OP_META } from '../../../constants/operations'
import { formatAmount, formatMoney } from '../../../utils/format'
import { fmtDate } from '../helpers'
import { fiscalCause, preciseEur, roleText, signedEur, usedFraction } from './fifoText'

// Trazabilidad FIFO de una transacción (#373), en EUR como Fiscal: de dónde
// salen sus unidades (lotes que consume) y adónde van (lotes que abre y qué
// operaciones los consumieron). Cada operación relacionada abre su detalle.
// Cada consumo dice su papel (traslado, comisión de red, venta…) y su destino,
// y cada lote cuánto queda sin usar y de qué compra viene (#405).

const label = (op: string) => OP_META[op]?.label ?? op
const tone = (v: number | null) => (v === null || v === 0 ? 'text-fg-muted' : v > 0 ? 'text-positive' : 'text-negative')
const effect = (v: number | null) => (v !== null && v < 0 ? 'pérdida' : 'ganancia')

function OpLink({ id, op, at, onOpen }: { id: string; op: string; at: string; onOpen: (id: string) => void }) {
  const { date, time } = fmtDate(at)
  return (
    <button type="button" onClick={() => onOpen(id)}
      className="text-left text-brand-ink hover:underline rounded focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
      {label(op)} · {date} {time}
    </button>
  )
}

/** Barra de lo consumido de un lote, con su texto («Sin usar X de Y» o «Usado por completo»). */
function LotUsage({ lot }: { lot: TransactionDetail['fifo']['opened'][number] }) {
  const used = usedFraction(lot.quantity_original, lot.quantity_remaining)
  const text = lot.is_closed
    ? 'Usado por completo'
    : `Sin usar ${formatAmount(lot.quantity_remaining ?? 0, 8)} de ${formatAmount(lot.quantity_original ?? 0, 8)}`
  return (
    <div className="mt-1.5">
      <div className="flex justify-between gap-2 text-fg-subtle">
        <span>{text}</span>
        {!lot.is_closed && used > 0 && <span className="mono">{Math.round(used * 100)} % usado</span>}
      </div>
      <div className="mt-1 h-1 rounded-full bg-overlay/10 overflow-hidden" aria-hidden="true">
        <div className="h-full rounded-full bg-brand-solid" style={{ width: `${used * 100}%` }} />
      </div>
    </div>
  )
}

export function FifoTrace({ fifo, onOpen }: { fifo: TransactionDetail['fifo']; onOpen: (id: string) => void }) {
  if (fifo.consumed.length === 0 && fifo.opened.length === 0) {
    return <p className="text-xs text-fg-subtle">Esta operación no mueve lotes FIFO (p. ej. un depósito o una retirada de euros).</p>
  }
  const cause = fiscalCause(fifo.consumed)
  const moved = fifo.opened.filter(l => l.source)
  return (
    <div className="space-y-4">
      {fifo.consumed.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-fg-muted mb-1.5">De dónde salen las unidades</h4>
          <ul className="space-y-1.5">
            {fifo.consumed.map(c => (
              <li key={c.id} className="rounded-lg border border-border px-3 py-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="font-medium text-fg">{roleText(c.role, c.destination_name)}</span>
                  <span className="mono text-fg-muted">{formatAmount(c.quantity ?? 0, 8)} {c.asset}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-2 mt-1 text-fg-subtle">
                  <span>De <OpLink id={c.origin.id} op={c.origin.operation_type} at={c.origin.timestamp} onOpen={onOpen} /> · {c.wallet_name}</span>
                  <span className="mono">
                    coste {preciseEur(c.cost_eur ?? 0)}
                    {c.fiscal_event_type === 'NONE'
                      ? ' · sin efecto fiscal'
                      : <> · {effect(c.gain_loss_eur)} <span className={tone(c.gain_loss_eur)}>{signedEur(c.gain_loss_eur)}</span></>}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-fg-muted">
            {cause ? (
              <>
                Efecto fiscal ({cause}): <span className="mono">coste {preciseEur(fifo.totals.cost_eur)} · transmisión {preciseEur(fifo.totals.proceeds_eur)} ·{' '}
                  <span className={`font-semibold ${tone(fifo.totals.gain_loss_eur)}`}>{signedEur(fifo.totals.gain_loss_eur)}</span></span>
              </>
            ) : 'Sin efecto fiscal: es un traslado entre wallets propias.'}
          </p>
        </div>
      )}
      {fifo.opened.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-fg-muted mb-1.5">Adónde van las unidades</h4>
          {moved.length > 1 && (
            <p className="mb-1.5 text-xs text-fg-subtle">
              Un lote por cada compra de origen: cada uno conserva su fecha y su coste, que es lo que usa el FIFO al vender.
            </p>
          )}
          <ul className="space-y-1.5">
            {fifo.opened.map(l => (
              <li key={l.id} className="rounded-lg border border-border px-3 py-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-fg">Lote de {formatAmount(l.quantity_original ?? 0, 8)} {l.asset} · {l.wallet_name}</span>
                  <span className="mono text-fg-muted">{formatMoney((l.price_per_unit_eur ?? 0) * (l.quantity_original ?? 0), 'EUR')}</span>
                </div>
                {l.source && (
                  <div className="mt-1 text-fg-subtle">
                    Viene de <OpLink id={l.source.id} op={l.source.operation_type} at={l.source.timestamp} onOpen={onOpen} />
                  </div>
                )}
                <LotUsage lot={l} />
                {l.consumed_by.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 border-l border-border pl-2" aria-label="Operaciones que han usado este lote">
                    {l.consumed_by.map(c => (
                      <li key={`${c.transaction_id}-${c.role}-${c.quantity}`} className="flex flex-wrap justify-between gap-x-2">
                        <span>
                          <OpLink id={c.transaction_id} op={c.operation_type} at={c.timestamp} onOpen={onOpen} />
                          <span className="text-fg-subtle"> · {roleText(c.role, c.destination_name, true)}</span>
                        </span>
                        <span className="mono text-fg-subtle">
                          {formatAmount(c.quantity ?? 0, 8)}
                          {c.fiscal_event_type !== 'NONE' && <> · <span className={tone(c.gain_loss_eur)}>{signedEur(c.gain_loss_eur)}</span></>}
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
