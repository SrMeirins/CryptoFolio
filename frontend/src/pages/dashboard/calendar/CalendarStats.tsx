import type { MonthStats } from '../../../utils/calendarStats'
import type { Currency } from '../../../utils/format'
import { signedMoney, signedPct, toneOf } from './format'

// Estadísticas del mes (#216): días positivos y negativos, mejor y peor día,
// racha actual y media diaria, junto al total del mes.

export function CalendarStats({ stats, total, currency }: { stats: MonthStats; total: { pnl: number; pct: number } | null; currency: Currency }) {
  const dayNum = (date: string) => Number(date.slice(8))
  return (
    <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-xs mb-3">
      {total && (
        <div className="flex items-baseline gap-1.5">
          <dt className="text-fg-subtle">Mes</dt>
          <dd className="mono font-semibold"><span className={toneOf(total.pnl)}>{signedMoney(total.pnl, currency)}</span> <span className={`font-normal opacity-80 ${toneOf(total.pct)}`}>({signedPct(total.pct)})</span></dd>
        </div>
      )}
      <div className="flex items-baseline gap-1.5">
        <dt className="text-fg-subtle">Días</dt>
        <dd className="mono"><span className="text-positive">{stats.positive} ▲</span> · <span className="text-negative">{stats.negative} ▼</span></dd>
      </div>
      {stats.best && (
        <div className="flex items-baseline gap-1.5">
          <dt className="text-fg-subtle">Mejor</dt>
          <dd className="mono text-positive">{signedMoney(stats.best.pnl, currency)} <span className="text-fg-subtle">día {dayNum(stats.best.date)}</span></dd>
        </div>
      )}
      {stats.worst && (
        <div className="flex items-baseline gap-1.5">
          <dt className="text-fg-subtle">Peor</dt>
          <dd className="mono text-negative">{signedMoney(stats.worst.pnl, currency)} <span className="text-fg-subtle">día {dayNum(stats.worst.date)}</span></dd>
        </div>
      )}
      {stats.streak && (
        <div className="flex items-baseline gap-1.5">
          <dt className="text-fg-subtle">Racha</dt>
          <dd className={`mono ${stats.streak.sign === 'up' ? 'text-positive' : 'text-negative'}`}>
            {stats.streak.days} {stats.streak.days === 1 ? 'día' : 'días'} {stats.streak.sign === 'up' ? '▲' : '▼'}
          </dd>
        </div>
      )}
      {(stats.positive + stats.negative) > 0 && (
        <div className="flex items-baseline gap-1.5">
          <dt className="text-fg-subtle">Media diaria</dt>
          <dd className={`mono ${toneOf(stats.average)}`}>{signedMoney(stats.average, currency)}</dd>
        </div>
      )}
    </dl>
  )
}
