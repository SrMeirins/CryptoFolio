import type { ReactNode } from 'react'
import { CalendarRange, Flame, Gauge, TrendingDown, TrendingUp } from 'lucide-react'
import type { MonthStats } from '../../../utils/calendarStats'
import type { Currency } from '../../../utils/format'
import { signedMoney, signedPct, toneOf } from './format'

// Estadísticas del mes en mini-tarjetas (#234): total del mes, mejor y peor
// día, racha actual, media diaria y anillo con la proporción de días positivos.

function StatCard({ icon, label, children, detail }: { icon: ReactNode; label: string; children: ReactNode; detail?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-overlay/2 px-3 py-2 min-w-0">
      <span aria-hidden="true" className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center bg-brand/10 text-brand-ink">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-fg-subtle leading-tight">{label}</p>
        <p className="text-sm font-semibold mono leading-tight truncate">{children}</p>
        {detail && <p className="text-[11px] text-fg-subtle leading-tight truncate">{detail}</p>}
      </div>
    </div>
  )
}

/** Anillo con la proporción de días positivos del mes. */
function PositiveRing({ positive, negative }: { positive: number; negative: number }) {
  const total = positive + negative
  const ratio = total ? positive / total : 0
  const r = 15
  const c = 2 * Math.PI * r
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-overlay/2 px-3 py-2"
      role="img" aria-label={`${positive} de ${total} días en positivo`}>
      <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden="true">
        <circle cx="19" cy="19" r={r} fill="none" strokeWidth="4" className="stroke-negative/35" />
        <circle cx="19" cy="19" r={r} fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-positive"
          strokeDasharray={`${ratio * c} ${c}`} transform="rotate(-90 19 19)" />
      </svg>
      <div aria-hidden="true">
        <p className="text-[10px] uppercase tracking-wider text-fg-subtle leading-tight">Días ▲</p>
        <p className="text-sm font-semibold mono leading-tight"><span className="text-positive">{positive}</span><span className="text-fg-subtle">/{total}</span></p>
        <p className="text-[11px] text-fg-subtle leading-tight">{negative} en negativo</p>
      </div>
    </div>
  )
}

export function CalendarStats({ stats, total, currency }: { stats: MonthStats; total: { pnl: number; pct: number } | null; currency: Currency }) {
  const dayNum = (date: string) => `día ${Number(date.slice(8))}`
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 mb-3">
      {total && (
        <StatCard icon={<CalendarRange size={14} />} label="Mes" detail={<span className={toneOf(total.pct)}>{signedPct(total.pct)}</span>}>
          <span className={toneOf(total.pnl)}>{signedMoney(total.pnl, currency)}</span>
        </StatCard>
      )}
      <PositiveRing positive={stats.positive} negative={stats.negative} />
      <StatCard icon={<TrendingUp size={14} />} label="Mejor día" detail={stats.best ? dayNum(stats.best.date) : undefined}>
        {stats.best ? <span className="text-positive">{signedMoney(stats.best.pnl, currency)}</span> : '—'}
      </StatCard>
      <StatCard icon={<TrendingDown size={14} />} label="Peor día" detail={stats.worst ? dayNum(stats.worst.date) : undefined}>
        {stats.worst ? <span className="text-negative">{signedMoney(stats.worst.pnl, currency)}</span> : '—'}
      </StatCard>
      <StatCard icon={<Flame size={14} />} label="Racha" detail={stats.streak ? (stats.streak.sign === 'up' ? 'en positivo' : 'en negativo') : undefined}>
        {stats.streak
          ? <span className={stats.streak.sign === 'up' ? 'text-positive' : 'text-negative'}>{stats.streak.days} {stats.streak.days === 1 ? 'día' : 'días'}</span>
          : '—'}
      </StatCard>
      <StatCard icon={<Gauge size={14} />} label="Media diaria">
        <span className={toneOf(stats.average)}>{signedMoney(stats.average, currency)}</span>
      </StatCard>
    </div>
  )
}
