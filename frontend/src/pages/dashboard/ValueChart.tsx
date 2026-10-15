import { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
} from 'recharts'
import { formatMoney, formatMoneyCompact, type Currency } from '../../utils/format'
import { formatPointDate, type EvolutionPoint } from '../../utils/evolutionSeries'
import { formatTick, niceTicks, tickDecimals, timeAxis } from '../../utils/chartAxes'
import { useChartColors } from '../../hooks/useChartColors'

// Pestaña Valor del gráfico de evolución: valor de la cartera en el periodo.
// Desde #215 usa la misma serie que la pestaña P&L (valor de cada día o de
// cada 15 min en 24H), con fechas reales y el último punto en vivo.

/** Importe de una marca del eje: sin decimales salvo que el paso los necesite. */
function axisMoney(v: number, decimals: number, currency: Currency): string {
  return decimals === 0 ? formatMoneyCompact(v, currency) : formatMoney(v, currency)
}

function ChartTooltip({ active, payload, currency, intraday }: {
  active?: boolean; payload?: { payload: EvolutionPoint }[]; currency: Currency; intraday: boolean
}) {
  if (!active || !payload?.[0]) return null
  const p = payload[0].payload
  return (
    <div className="bg-tooltip/95 border border-overlay/10 rounded-xl px-3 py-2.5 shadow-xl text-xs space-y-0.5">
      <p className="text-fg-muted">{formatPointDate(p.x, intraday)}{p.live ? ' · en vivo' : ''}</p>
      <p className="text-fg mono font-semibold">{formatMoney(p.value, currency)}</p>
    </div>
  )
}

export function ValueChart({ points, currency, intraday, loading, error, liveValue }: {
  points: EvolutionPoint[]
  currency: Currency
  intraday: boolean
  loading: boolean
  error: boolean
  /** Valor de hoy con los precios en vivo (serie diaria); sustituye al del último punto. */
  liveValue: number | null
}) {
  const c = useChartColors()

  const data = useMemo(() => {
    const last = points[points.length - 1]
    if (!last?.live || liveValue === null || intraday) return points
    return [...points.slice(0, -1), { ...last, value: liveValue }]
  }, [points, liveValue, intraday])

  const change = data.length >= 2 ? data[data.length - 1].value - data[0].value : 0
  const isPositive = change >= 0
  const color = isPositive ? c.up : c.down

  const xAxis = useMemo(() => timeAxis(data.map(p => p.x), intraday), [data, intraday])
  const yTicks = useMemo(() => {
    const vals = data.map(p => p.value)
    return vals.length ? niceTicks(Math.min(...vals), Math.max(...vals), 4) : []
  }, [data])
  const yDecimals = tickDecimals(yTicks)

  return (
    <>
      <div className="flex items-center gap-3 mb-4 min-h-6" aria-live="polite">
        {data.length >= 2 && (
          <p className={`text-xs mono ${isPositive ? 'text-positive' : 'text-negative'}`}>
            <span aria-hidden="true">{isPositive ? '▲' : '▼'} </span>
            {change >= 0 ? '+' : ''}{formatMoney(change, currency)} en el periodo
          </p>
        )}
      </div>

      <div className="h-52 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-fg-subtle">Cargando…</div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-fg-subtle">No se pudo cargar el valor de la cartera.</div>
        )}
        {!loading && !error && data.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-fg-subtle">Sin datos para este periodo</div>
        )}
        {data.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="histGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={c.grid} />
              <XAxis
                dataKey="x"
                type="number"
                scale="time"
                domain={xAxis.domain}
                ticks={xAxis.ticks}
                interval={0}
                tickFormatter={(x: number) => formatTick(x, xAxis.unit)}
                tick={{ fontSize: 12, fill: c.axis }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[yTicks[0], yTicks[yTicks.length - 1]]}
                ticks={yTicks}
                interval={0}
                tick={{ fontSize: 12, fill: c.axis }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => axisMoney(v, yDecimals, currency)}
                width={76}
              />
              <RechartsTooltip content={<ChartTooltip currency={currency} intraday={intraday} />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                fill="url(#histGradient)"
                dot={false}
                activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </>
  )
}
