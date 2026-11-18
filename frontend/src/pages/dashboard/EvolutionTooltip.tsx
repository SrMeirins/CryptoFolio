import { formatMoney, formatPercent, type Currency } from '../../utils/format'
import { formatPointDate, type EvolutionPoint } from '../../utils/evolutionSeries'
import type { ValoresReferencia } from '../../utils/evolucionReferencia'

// Tooltip común de las pestañas P&L y Valor (#214): fecha, rentabilidad del
// día (o tramo de 15 min) y acumulada, P&L, valor de la cartera y, si lo hubo,
// el depósito o la retirada de ese día.

const signedMoney = (n: number, currency: Currency) => `${n >= 0 ? '+' : ''}${formatMoney(n, currency)}`
const tone = (n: number) => (n > 0 ? 'text-positive' : n < 0 ? 'text-negative' : 'text-fg-muted')

export function EvolutionTooltip({ active, payload, currency, intraday, primary, referencia = null }: {
  active?: boolean
  payload?: { payload: EvolutionPoint & { ref?: ValoresReferencia | null } }[]
  currency: Currency
  intraday: boolean
  primary: 'pct' | 'pnl' | 'value'
  /** Referencia con la que se compara (#510): su valor en la misma base. */
  referencia?: string | null
}) {
  if (!active || !payload?.[0]) return null
  const p = payload[0].payload
  const rows: Array<[string, string, string]> = [
    ['Acumulado', formatPercent(p.pct, 2, true), tone(p.pct)],
    [intraday ? 'Tramo de 15 min' : 'Día', p.stepPct === null ? '—' : formatPercent(p.stepPct, 2, true), tone(p.stepPct ?? 0)],
    ['P&L acumulado', signedMoney(p.pnl, currency), tone(p.pnl)],
    ['Valor', formatMoney(p.value, currency), 'text-fg'],
  ]
  const order = primary === 'value' ? [3, 0, 1, 2] : primary === 'pnl' ? [2, 0, 1, 3] : [0, 1, 2, 3]
  return (
    // Compacto y opaco (#510): la cifra principal destaca y el resto va discreto; no se mezcla con la curva.
    <div className="rounded-lg border border-border bg-background-card shadow-xl px-3 py-2 text-[11px] min-w-44">
      <p className="text-fg-subtle">{formatPointDate(p.x, intraday)}{p.live ? ', en vivo' : ''}</p>
      {(() => { const [label, value, color] = rows[order[0]]; return (
        <p className={`mt-0.5 mb-1 mono text-sm font-bold ${color}`}><span className="sr-only">{label}: </span>{value}</p>
      ) })()}
      <dl className="space-y-0.5">
        {order.slice(1).map(i => {
          const [label, value, color] = rows[i]
          return (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-fg-subtle">{label}</dt>
              <dd className={`mono ${color}`}>{value}</dd>
            </div>
          )
        })}
      </dl>
      {referencia && p.ref && (
        <p className="mt-1.5 pt-1.5 border-t border-overlay/10 flex justify-between gap-4">
          <span className="text-fg-subtle">Con {referencia}</span>
          <span className="mono text-warning-ink">
            {primary === 'value' ? formatMoney(p.ref.value, currency) : primary === 'pnl' ? signedMoney(p.ref.pnl, currency) : formatPercent(p.ref.pct, 2, true)}
          </span>
        </p>
      )}
      {(p.deposit >= 0.01 || p.withdrawal >= 0.01) && (
        <div className="mt-1.5 pt-1.5 border-t border-overlay/10 mono">
          {p.deposit >= 0.01 && <p className="text-positive">Depósito +{formatMoney(p.deposit, currency)}</p>}
          {p.withdrawal >= 0.01 && <p className="text-negative">Retirada −{formatMoney(p.withdrawal, currency)}</p>}
        </div>
      )}
    </div>
  )
}
