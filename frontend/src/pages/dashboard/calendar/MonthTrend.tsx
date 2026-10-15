import { useMemo } from 'react'
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts'
import type { CalendarDay } from '../../../utils/pnlCalendar'
import { monthCumulative } from '../../../utils/calendarStats'
import { zeroSplit } from '../../../utils/zeroSplit'
import { useChartColors } from '../../../hooks/useChartColors'
import { useReducedMotion } from '../../../hooks/useReducedMotion'
import type { Currency } from '../../../utils/format'
import { longDate, signedMoney } from './format'

// Gráfico del mes (#234): P&L acumulado día a día sobre la cuadrícula. Al pasar
// por un punto se resalta su celda, y al pasar por una celda, su punto.

export function MonthTrend({ days, currency, hovered, onHover, lastDay }: {
  days: readonly CalendarDay[]
  currency: Currency
  hovered: string | null
  onHover: (date: string | null) => void
  lastDay: number
}) {
  const c = useChartColors()
  const reduceMotion = useReducedMotion()
  const data = useMemo(() => monthCumulative(days), [days])
  const split = useMemo(() => zeroSplit(data.map(d => d.cum)), [data])
  const active = data.find(d => d.date === hovered)
  if (data.length < 2) return null
  const last = data[data.length - 1]
  return (
    <div className="relative h-20 mb-3 -mx-1" aria-label={`P&L acumulado del mes: ${signedMoney(last.cum, currency)}`} role="img">
      <p aria-hidden="true" className="absolute top-0 right-2 z-10 text-[10px] uppercase tracking-wider text-fg-subtle pointer-events-none">
        Acumulado del mes <span className={`mono normal-case tracking-normal font-semibold ${last.cum >= 0 ? 'text-positive' : 'text-negative'}`}>{signedMoney(last.cum, currency)}</span>
      </p>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}
          onMouseMove={s => onHover(data.find(d => d.day === Number(s?.activeLabel))?.date ?? null)}
          onMouseLeave={() => onHover(null)}>
          <defs>
            <linearGradient id="monthTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor={c.up} stopOpacity={0.3} />
              <stop offset={split.fill} stopColor={c.up} stopOpacity={0.04} />
              <stop offset={split.fill} stopColor={c.down} stopOpacity={0.04} />
              <stop offset={1} stopColor={c.down} stopOpacity={0.3} />
            </linearGradient>
            <linearGradient id="monthTrendStroke" x1="0" y1="0" x2="0" y2="1">
              <stop offset={split.stroke ?? 0} stopColor={c.up} />
              <stop offset={split.stroke ?? 0} stopColor={c.down} />
            </linearGradient>
          </defs>
          <XAxis dataKey="day" type="number" domain={[1, lastDay]} hide />
          <YAxis hide domain={['auto', 'auto']} />
          <ReferenceLine y={0} stroke={c.grid} />
          <RechartsTooltip cursor={{ stroke: c.cursorLine, strokeDasharray: '3 3' }} content={({ active: on, payload }) => {
            const p = on && payload?.[0]?.payload as { date: string; pnl: number; cum: number } | undefined
            return p ? (
              <div className="bg-tooltip/95 border border-overlay/10 rounded-lg px-2.5 py-1.5 text-xs shadow-xl">
                <p className="text-fg-muted first-letter:uppercase">{longDate(p.date)}</p>
                <p className="mono text-fg">Día {signedMoney(p.pnl, currency)} · acumulado {signedMoney(p.cum, currency)}</p>
              </div>
            ) : null
          }} />
          <Area type="monotone" dataKey="cum" baseValue={0} strokeWidth={2} dot={false}
            stroke={split.stroke === null ? (split.solid === 'up' ? c.up : c.down) : 'url(#monthTrendStroke)'}
            fill="url(#monthTrendFill)" isAnimationActive={!reduceMotion} animationDuration={600}
            activeDot={{ r: 4, strokeWidth: 0, fill: (active?.cum ?? 0) >= 0 ? c.up : c.down }} />
          {active && <ReferenceLine x={active.day} stroke={c.axis} strokeDasharray="3 3" />}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
