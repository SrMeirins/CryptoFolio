import { formatMoney, formatPercent, type Currency } from '../../utils/format'
import { formatPointDate, type EvolutionPoint } from '../../utils/evolutionSeries'

// Tooltip común de las pestañas P&L y Valor (#214): fecha, rentabilidad del
// día (o tramo de 15 min) y acumulada, P&L, valor de la cartera y, si lo hubo,
// el depósito o la retirada de ese día.

const signedMoney = (n: number, currency: Currency) => `${n >= 0 ? '+' : ''}${formatMoney(n, currency)}`
const tone = (n: number) => (n > 0 ? 'text-positive' : n < 0 ? 'text-negative' : 'text-fg-muted')

export function EvolutionTooltip({ active, payload, currency, intraday, primary }: {
  active?: boolean
  payload?: { payload: EvolutionPoint }[]
  currency: Currency
  intraday: boolean
  primary: 'pct' | 'pnl' | 'value'
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
    <div className="glass-tooltip rounded-xl px-3 py-2.5 text-xs min-w-48">
      <p className="text-fg-muted mb-1.5">{formatPointDate(p.x, intraday)}{p.live ? ' · en vivo' : ''}</p>
      <dl className="space-y-0.5">
        {order.map((i, k) => {
          const [label, value, color] = rows[i]
          return (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-fg-subtle">{label}</dt>
              <dd className={`mono ${color} ${k === 0 ? 'font-semibold' : ''}`}>{value}</dd>
            </div>
          )
        })}
      </dl>
      {(p.deposit >= 0.01 || p.withdrawal >= 0.01) && (
        <div className="mt-1.5 pt-1.5 border-t border-overlay/10 mono">
          {p.deposit >= 0.01 && <p className="text-positive">Depósito +{formatMoney(p.deposit, currency)}</p>}
          {p.withdrawal >= 0.01 && <p className="text-negative">Retirada −{formatMoney(p.withdrawal, currency)}</p>}
        </div>
      )}
    </div>
  )
}
