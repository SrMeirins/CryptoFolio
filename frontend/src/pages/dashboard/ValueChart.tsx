import { useId, useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ReferenceDot, ResponsiveContainer, Customized,
} from 'recharts'
import { formatMoney, formatMoneyCompact, type Currency } from '../../utils/format'
import type { EvolutionPoint } from '../../utils/evolutionSeries'
import { flowBuckets } from '../../utils/evolutionSummary'
import { formatTick, niceTicks, tickDecimals, timeAxis } from '../../utils/chartAxes'
import { useChartColors } from '../../hooks/useChartColors'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { useTransientFlag } from '../../hooks/useTransientFlag'
import { EvolutionTooltip } from './EvolutionTooltip'
import { LiveDot } from './LiveDot'
import { ChartFrame } from './ChartFrame'
import { FlowMarkerLayer, FlowMarkerTooltip, type ActiveMarker } from './FlowMarkers'

// Pestaña Valor del gráfico de evolución: valor de la cartera en el periodo,
// con la misma serie que la pestaña P&L (#215), marcadores de depósitos y
// retiradas y punto final vivo (#214).

/** Importe de una marca del eje: sin decimales salvo que el paso los necesite. */
function axisMoney(v: number, decimals: number, currency: Currency): string {
  return decimals === 0 ? formatMoneyCompact(v, currency) : formatMoney(v, currency)
}

export function ValueChart({ points, currency, intraday, animationKey, loading, error }: {
  points: EvolutionPoint[]
  currency: Currency
  intraday: boolean
  animationKey: string
  loading: boolean
  error: boolean
}) {
  const c = useChartColors()
  const reduceMotion = useReducedMotion()
  // Al cambiar de periodo o unidad la curva se transforma en la nueva (#255) en
  // vez de redibujarse desde cero; con los ticks en vivo no se anima.
  const animating = useTransientFlag(animationKey, 900)
  const gradientId = useId().replace(/:/g, '')

  const change = points.length >= 2 ? points[points.length - 1].value - points[0].value : 0
  const color = change >= 0 ? c.up : c.down

  const xAxis = useMemo(() => timeAxis(points.map(p => p.x), intraday), [points, intraday])
  const yTicks = useMemo(() => {
    const vals = points.map(p => p.value)
    return vals.length ? niceTicks(Math.min(...vals), Math.max(...vals), 4) : []
  }, [points])
  const yDecimals = tickDecimals(yTicks)
  const buckets = useMemo(() => flowBuckets(points, intraday), [points, intraday])
  const [activeMarker, setActiveMarker] = useState<ActiveMarker | null>(null)
  const last = points[points.length - 1]

  return (
    <ChartFrame loading={loading} error={error} empty={points.length === 0} errorText="No se pudo cargar el valor de la cartera.">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.22} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis
            dataKey="x" type="number" scale="time" domain={xAxis.domain} ticks={xAxis.ticks} interval={0}
            tickFormatter={(x: number) => formatTick(x, xAxis.unit)}
            tick={{ fontSize: 12, fill: c.axis }} axisLine={false} tickLine={false}
          />
          <YAxis
            domain={[yTicks[0], yTicks[yTicks.length - 1]]} ticks={yTicks} interval={0}
            tickFormatter={(v: number) => axisMoney(v, yDecimals, currency)}
            tick={{ fontSize: 12, fill: c.axis }} axisLine={false} tickLine={false} width={76}
          />
          <RechartsTooltip
            active={activeMarker ? false : undefined}
            cursor={{ stroke: c.cursorLine, strokeWidth: 1, strokeDasharray: '4 4' }}
            content={<EvolutionTooltip currency={currency} intraday={intraday} primary="value" />}
          />
          <Area
            type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`}
            dot={false} activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
            isAnimationActive={!reduceMotion && animating} animationDuration={600} animationEasing="ease-in-out"
          />
          <Customized component={
            <FlowMarkerLayer buckets={buckets} yKey={'value'} active={activeMarker} onActivate={setActiveMarker}
              colors={{ up: c.up, down: c.down, ring: c.axis, bg: c.tooltipBg }} intraday={intraday} currency={currency} />
          } />
          {last?.live && (
            <ReferenceDot x={last.x} y={last.value} ifOverflow="visible" shape={<LiveDot color={color} />} />
          )}
        </AreaChart>
      </ResponsiveContainer>
      <FlowMarkerTooltip marker={activeMarker} intraday={intraday} currency={currency} />
    </ChartFrame>
  )
}
