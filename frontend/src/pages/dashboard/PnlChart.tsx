import { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { InfoTooltip } from '../../components/InfoTooltip'
import { formatMoney, formatPercent, type Currency } from '../../utils/format'
import { METRIC_LABELS, type PnlMetric } from '../../utils/pnlChart'
import { formatPointDate, type EvolutionPoint } from '../../utils/evolutionSeries'
import { formatTick, niceTicks, tickDecimals, timeAxis } from '../../utils/chartAxes'
import { useChartColors } from '../../hooks/useChartColors'

// Pestaña P&L del gráfico de evolución (#166): rentabilidad acumulada del
// periodo. Datos, periodo y cabecera los gestiona EvolutionCard (#215).

const signed = (n: number, digits = 2) => formatPercent(n, digits, true)
const signedMoney = (n: number, currency: Currency) => `${n >= 0 ? '+' : ''}${formatMoney(n, currency)}`

function ChartTooltip({ active, payload, currency, intraday }: {
  active?: boolean; payload?: { payload: EvolutionPoint }[]; currency: Currency; intraday: boolean
}) {
  if (!active || !payload?.[0]) return null
  const p = payload[0].payload
  const color = p.pct >= 0 ? 'text-positive' : 'text-negative'
  return (
    <div className="bg-tooltip/95 border border-overlay/10 rounded-xl px-3 py-2.5 shadow-xl text-xs space-y-0.5">
      <p className="text-fg-muted">{formatPointDate(p.x, intraday)}{p.live ? ' · en vivo' : ''}</p>
      <p className={`mono font-semibold ${color}`}>{signed(p.pct)}</p>
      <p className="text-fg mono">{signedMoney(p.pnl, currency)} acumulado</p>
    </div>
  )
}

export function PnlChart({ points, currency, intraday, metric, loading, error, refreshing, approximate }: {
  points: EvolutionPoint[]
  currency: Currency
  intraday: boolean
  metric: PnlMetric
  loading: boolean
  error: boolean
  refreshing: boolean
  approximate: string[]
}) {
  const c = useChartColors()
  const labels = METRIC_LABELS[metric]
  const last = points[points.length - 1]
  const positive = (last?.pct ?? 0) >= 0
  const color = positive ? c.up : c.down

  // Ejes alineados al calendario (o cada 3 h en 24H) y con valores redondos (#212, #215).
  const xAxis = useMemo(() => timeAxis(points.map(p => p.x), intraday), [points, intraday])
  const yTicks = useMemo(() => {
    const pcts = points.map(p => p.pct)
    return pcts.length ? niceTicks(Math.min(...pcts), Math.max(...pcts), 4, true) : []
  }, [points])
  const yDecimals = tickDecimals(yTicks)

  return (
    <>
      <div className="flex items-center gap-3 mb-4 min-h-6 flex-wrap" aria-live="polite">
        {last && (
          <p className={`text-sm mono font-semibold ${positive ? 'text-positive' : 'text-negative'}`}>
            <span aria-hidden="true">{positive ? '▲' : '▼'} </span>
            {signed(last.pct)} <span className="text-xs font-normal opacity-80">({signedMoney(last.pnl, currency)})</span>
          </p>
        )}
        <span className="inline-flex items-center gap-1 text-xs text-fg-subtle">
          {labels.short}
          <InfoTooltip label={labels.short}>
            {labels.help}
            {intraday && <p>Últimas 24 horas, un punto cada 15 minutos y el último con los precios en vivo.</p>}
            {approximate.length > 0 && (
              <p>Sin precios de 15 min (valorados con el precio actual): <span className="mono">{approximate.join(', ')}</span></p>
            )}
          </InfoTooltip>
        </span>
        {refreshing && (
          <span className="flex items-center gap-1.5 text-xs text-fg-subtle">
            <span className="w-2.5 h-2.5 border border-border border-t-fg-subtle rounded-full animate-spin" aria-hidden="true" />
            Descargando precios de cierre…
          </span>
        )}
      </div>

      <div className="h-52 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-fg-subtle">Cargando…</div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-fg-subtle">No se pudo cargar la rentabilidad.</div>
        )}
        {!loading && !error && points.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-fg-subtle">Sin datos para este periodo</div>
        )}
        {points.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
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
                tickFormatter={(v: number) => formatPercent(v, yDecimals)}
                width={52}
              />
              {/* Línea del 0 % destacada sobre la rejilla */}
              <ReferenceLine y={0} stroke={c.axis} strokeWidth={1.25} />
              <RechartsTooltip content={<ChartTooltip currency={currency} intraday={intraday} />} />
              <Area
                type="monotone"
                dataKey="pct"
                stroke={color}
                strokeWidth={2}
                fill="url(#pnlGradient)"
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
