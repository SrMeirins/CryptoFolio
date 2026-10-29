import type { CSSProperties } from 'react'
import type { MonthTotal } from '../../../utils/calendarStats'
import { heatVars } from '../../../utils/topMovers'
import { compareYm, type YearMonth } from '../../../utils/pnlCalendar'
import type { Currency } from '../../../utils/format'
import { signedMoney, signedPct } from './format'

// Vista anual (#216): los 12 meses con su P&L y rentabilidad; al pulsar un mes
// se abre en la vista mensual. Mismo marco de intensidad que los días (#412).

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export function CalendarYearView({ year, months, current, currency, onOpen }: {
  year: number
  months: Array<MonthTotal | null>
  current: YearMonth
  currency: Currency
  onOpen: (ym: YearMonth) => void
}) {
  const maxAbs = months.reduce((m, t) => Math.max(m, Math.abs(t?.pnl ?? 0)), 0)
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 animate-page-in">
      {MONTHS.map((name, i) => {
        const ym = { year, month: i + 1 }
        const total = months[i]
        const future = compareYm(ym, current) > 0
        const isCurrent = compareYm(ym, current) === 0
        return (
          <button key={name} type="button" disabled={future} onClick={() => onOpen(ym)}
            aria-label={`${name} de ${year}${total ? `: ${signedMoney(total.pnl, currency)}, ${signedPct(total.pct)}` : future ? ': mes futuro' : ': sin datos'}`}
            style={total ? heatVars(total.pnl, maxAbs) as CSSProperties : undefined}
            className={`relative h-20 rounded-xl text-left transition-[transform,box-shadow] duration-150 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand
              disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:-translate-y-0.5
              ${total ? 'heat-frame p-px enabled:hover:shadow-[0_10px_22px_-14px_var(--card)]' : 'border border-border/50 bg-overlay/3'} ${isCurrent ? 'ring-1 ring-brand/60' : ''}`}>
            <span className={`block h-full rounded-[11px] p-3 ${total ? 'heat-body' : ''}`}>
              <span className="block text-[11px] uppercase tracking-widest text-fg-subtle" aria-hidden="true">{name}</span>
              {total ? (
                <span aria-hidden="true" className="flex items-baseline gap-2 mt-1.5 flex-wrap">
                  <span className={`text-[15px] mono font-bold ${total.pnl > 0 ? 'text-positive-ink' : total.pnl < 0 ? 'text-negative-ink' : 'text-fg-muted'}`}>{signedMoney(total.pnl, currency)}</span>
                  <span className={`text-[11px] mono font-semibold px-1.5 py-0.5 rounded-md ${total.pct > 0 ? 'bg-positive/10 text-positive-ink' : total.pct < 0 ? 'bg-negative/10 text-negative-ink' : 'bg-overlay/6 text-fg-subtle'}`}>{signedPct(total.pct)}</span>
                </span>
              ) : <span className="block mt-1.5 text-xs mono text-fg-subtle" aria-hidden="true">—</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
