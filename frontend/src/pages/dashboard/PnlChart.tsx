import { useId, useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ReferenceLine, ReferenceDot, ResponsiveContainer,
} from 'recharts'
import { formatMoneyCompact, formatMoney, formatPercent, type Currency } from '../../utils/format'
import type { EvolutionPoint } from '../../utils/evolutionSeries'
import { flowMarkers } from '../../utils/evolutionSummary'
import { formatTick, niceTicks, tickDecimals, timeAxis } from '../../utils/chartAxes'
import { useChartColors } from '../../hooks/useChartColors'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { EvolutionTooltip } from './EvolutionTooltip'
import { LiveDot } from './LiveDot'
import { ChartFrame } from './ChartFrame'

// Pestaña P&L del gráfico de evolución (#166, #214): rentabilidad acumulada en
// % o P&L acumulado en la moneda. Verde por encima de 0 y rojo por debajo, con
// el área entre la curva y el 0; marcadores de depósitos y retiradas y punto
// final vivo. Datos y cabecera los gestiona EvolutionCard.

export type PnlUnit = 'pct' | 'eur'

export function PnlChart({ points, currency, intraday, unit, animationKey, loading, error }: {
  points: EvolutionPoint[]
  currency: Currency
  intraday: boolean
  unit: PnlUnit
  /** Cambia con el periodo: la curva se vuelve a dibujar al cambiarlo. */
  animationKey: string
  loading: boolean
  error: boolean
}) {
  const c = useChartColors()
  const reduceMotion = useReducedMotion()
  const gradientId = useId().replace(/:/g, '')
  const key: 'pct' | 'pnl' = unit === 'pct' ? 'pct' : 'pnl'

  // Ejes alineados al calendario (o cada 3 h en 24H) y con valores redondos (#212, #215).
  const xAxis = useMemo(() => timeAxis(points.map(p => p.x), intraday), [points, intraday])
  const yTicks = useMemo(() => {
    const vals = points.map(p => p[key])
    return vals.length ? niceTicks(Math.min(...vals), Math.max(...vals), 4, true) : []
  }, [points, key])
  const yDecimals = tickDecimals(yTicks)
  const yMin = yTicks[0] ?? 0
  const yMax = yTicks[yTicks.length - 1] ?? 0
  // Punto del degradado donde está el 0: verde por encima, rojo por debajo.
  const zero = yMax <= 0 ? 0 : yMin >= 0 ? 1 : yMax / (yMax - yMin)
  const markers = useMemo(() => flowMarkers(points), [points])
  const last = points[points.length - 1]
  const lastColor = (last?.[key] ?? 0) >= 0 ? c.up : c.down
  const yFormat = (v: number) => (unit === 'pct' ? formatPercent(v, yDecimals) : yDecimals === 0 ? formatMoneyCompact(v, currency) : formatMoney(v, currency))

  return (
    <ChartFrame loading={loading} error={error} empty={points.length === 0} errorText="No se pudo cargar la rentabilidad.">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart key={animationKey} data={points} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`${gradientId}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor={c.up} stopOpacity={0.28} />
              <stop offset={zero} stopColor={c.up} stopOpacity={0.03} />
              <stop offset={zero} stopColor={c.down} stopOpacity={0.03} />
              <stop offset={1} stopColor={c.down} stopOpacity={0.28} />
            </linearGradient>
            <linearGradient id={`${gradientId}-stroke`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={zero} stopColor={c.up} />
              <stop offset={zero} stopColor={c.down} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis
            dataKey="x" type="number" scale="time" domain={xAxis.domain} ticks={xAxis.ticks} interval={0}
            tickFormatter={(x: number) => formatTick(x, xAxis.unit)}
            tick={{ fontSize: 12, fill: c.axis }} axisLine={false} tickLine={false}
          />
          <YAxis
            domain={[yMin, yMax]} ticks={yTicks} interval={0} tickFormatter={yFormat}
            tick={{ fontSize: 12, fill: c.axis }} axisLine={false} tickLine={false} width={unit === 'pct' ? 52 : 76}
          />
          {/* Línea del 0 destacada sobre la rejilla */}
          <ReferenceLine y={0} stroke={c.axis} strokeWidth={1.25} />
          <RechartsTooltip
            cursor={{ stroke: c.cursorLine, strokeWidth: 1, strokeDasharray: '4 4' }}
            content={<EvolutionTooltip currency={currency} intraday={intraday} primary={unit === 'pct' ? 'pct' : 'pnl'} />}
          />
          <Area
            type="monotone" dataKey={key} baseValue={0}
            stroke={`url(#${gradientId}-stroke)`} strokeWidth={2} fill={`url(#${gradientId}-fill)`}
            dot={false} activeDot={{ r: 4, fill: lastColor, strokeWidth: 0 }}
            isAnimationActive={!reduceMotion} animationDuration={700} animationEasing="ease-out"
          />
          {markers.map(m => (
            <ReferenceDot key={m.x} x={m.x} y={m[key]} r={4} ifOverflow="visible"
              fill={m.flow > 0 ? c.up : c.down} stroke={c.tooltipBg} strokeWidth={2} />
          ))}
          {last?.live && (
            <ReferenceDot x={last.x} y={last[key]} ifOverflow="visible" shape={<LiveDot color={lastColor} />} />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}
