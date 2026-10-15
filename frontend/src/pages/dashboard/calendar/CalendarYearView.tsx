import type { MonthTotal } from '../../../utils/calendarStats'
import { heatBackground } from '../../../utils/topMovers'
import { compareYm, type YearMonth } from '../../../utils/pnlCalendar'
import type { Currency } from '../../../utils/format'
import { signedMoney, signedPct } from './format'

// Vista anual (#216): los 12 meses con su P&L y rentabilidad, coloreados por
// intensidad; al pulsar un mes se abre en la vista mensual.

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
            style={total ? { background: heatBackground(total.pnl, maxAbs) } : undefined}
            className={`h-20 rounded-xl border p-3 text-left transition-[transform,box-shadow] duration-150 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:shadow-lg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand
              disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:-translate-y-px ${isCurrent ? 'border-brand/60' : 'border-border/50'}`}>
            <span className="block text-xs font-medium text-fg-muted" aria-hidden="true">{name}</span>
            {total ? (
              <span aria-hidden="true">
                <span className="block mt-1 text-sm mono font-semibold text-fg">{signedMoney(total.pnl, currency)}</span>
                <span className="block text-xs mono text-fg">{signedPct(total.pct)}</span>
              </span>
            ) : <span className="block mt-1 text-xs mono text-fg-subtle" aria-hidden="true">—</span>}
          </button>
        )
      })}
    </div>
  )
}
