import { CalendarRange, Flame, Gauge, TrendingDown, TrendingUp } from 'lucide-react'
import { StatCard } from '../../../components/ui'
import { T } from '../../../utils/colors'
import type { MonthStats } from '../../../utils/calendarStats'
import type { Currency } from '../../../utils/format'
import { signedMoney, signedPct } from './format'

// Estadísticas del mes en mini tarjetas (#234) con la variante compacta de
// StatCard (#412): total del mes, días en positivo con su anillo, mejor y peor
// día (abren el detalle de ese día), racha actual y media diaria. Bajo la
// cifra, como mucho un chip; el resto, en la ayuda.

const signTone = (n: number): 'positive' | 'negative' | undefined => (n > 0 ? 'positive' : n < 0 ? 'negative' : undefined)
const signColor = (n: number) => (n > 0 ? T.positive : n < 0 ? T.negative : T.muted)
const chipClass = 'mono text-[11px] font-semibold px-1.5 py-0.5 rounded-md'

/** Anillo con la proporción de días positivos del mes; decorativo (la cifra lo dice). */
export function PositiveRing({ positive, negative }: { positive: number; negative: number }) {
  const total = positive + negative
  const ratio = total ? positive / total : 0
  const r = 9
  const c = 2 * Math.PI * r
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <circle cx="12" cy="12" r={r} fill="none" strokeWidth="3.5" className="stroke-negative/35" />
      <circle cx="12" cy="12" r={r} fill="none" strokeWidth="3.5" strokeLinecap="round" className="stroke-positive"
        strokeDasharray={`${ratio * c} ${c}`} transform="rotate(-90 12 12)" />
    </svg>
  )
}

export function CalendarStats({ stats, total, currency, selected = null, onOpenDay }: {
  stats: MonthStats
  total: { pnl: number; pct: number } | null
  currency: Currency
  /** Día cuyo detalle está abierto. */
  selected?: string | null
  /** Abre o cierra el detalle de un día. */
  onOpenDay?: (date: string) => void
}) {
  const dayChip = (date: string) => `día ${Number(date.slice(8))}`
  const days = stats.positive + stats.negative
  const extreme = (kind: 'best' | 'worst', delay: number) => {
    const e = stats[kind]
    const best = kind === 'best'
    const label = best ? 'Mejor día' : 'Peor día'
    const open = !!e && selected === e.date
    return (
      <StatCard compact title={label} icon={best ? TrendingUp : TrendingDown} color={best ? T.positive : T.negative}
        tone={e ? (best ? 'positive' : 'negative') : undefined} value={e ? signedMoney(e.pnl, currency) : '—'} delay={delay}
        chip={e && <span className={`${chipClass} ${best ? 'bg-positive/10 text-positive-ink' : 'bg-negative/10 text-negative-ink'}`}>{dayChip(e.date)}</span>}
        help={<p>{best ? 'Mayor ganancia' : 'Mayor pérdida'} de un día del mes, sin contar depósitos ni retiradas.</p>}
        helpLabel={`Qué mide ${label}`}
        {...(e && onOpenDay && {
          onSelect: () => onOpenDay(e.date), expands: true, active: open,
          actionLabel: `${dayChip(e.date)}. ${open ? 'Ocultar' : 'Ver'} el detalle del día`,
        })} />
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 mb-3">
      {total && (
        <StatCard compact title="Mes" icon={CalendarRange} color={signColor(total.pnl)} tone={signTone(total.pnl)}
          value={signedMoney(total.pnl, currency)}
          chip={<span className={`${chipClass} ${total.pct > 0 ? 'bg-positive/10 text-positive-ink' : total.pct < 0 ? 'bg-negative/10 text-negative-ink' : 'bg-overlay/6 text-fg-subtle'}`}>{signedPct(total.pct)}</span>}
          help={<p>P&L del mes con los días cerrados, sin contar depósitos ni retiradas; el % es la rentabilidad del mes.</p>}
          helpLabel="Qué mide Mes" />
      )}
      <StatCard compact title="Días" visual={<PositiveRing positive={stats.positive} negative={stats.negative} />}
        color={T.positive} value={`${stats.positive}/${days}`} delay={60}
        help={<p>{stats.positive} de {days} días del mes en positivo y {stats.negative} en negativo.</p>}
        helpLabel="Qué mide Días" />
      {extreme('best', 120)}
      {extreme('worst', 180)}
      <StatCard compact title="Racha" icon={Flame} delay={240}
        color={stats.streak ? (stats.streak.sign === 'up' ? T.positive : T.negative) : T.muted}
        tone={stats.streak ? (stats.streak.sign === 'up' ? 'positive' : 'negative') : undefined}
        value={stats.streak ? `${stats.streak.days} ${stats.streak.days === 1 ? 'día' : 'días'}` : '—'}
        help={<p>Días seguidos con el mismo signo hasta el último día con dato{stats.streak ? `, ahora ${stats.streak.sign === 'up' ? 'en positivo' : 'en negativo'}` : ''}.</p>}
        helpLabel="Qué mide Racha" />
      <StatCard compact title="Media diaria" icon={Gauge} color={signColor(stats.average)} tone={signTone(stats.average)} delay={300}
        value={signedMoney(stats.average, currency)}
        help={<p>P&L medio de los días del mes con dato.</p>}
        helpLabel="Qué mide Media diaria" />
    </div>
  )
}
