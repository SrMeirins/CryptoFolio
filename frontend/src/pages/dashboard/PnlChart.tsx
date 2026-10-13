import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { portfolioApi } from '../../api/portfolio'
import { InfoTooltip } from '../../components/InfoTooltip'
import { formatEur } from '../../utils/format'
import {
  PNL_PERIODS, METRIC_LABELS, buildPnlSeries, madridToday, metricFor, periodFrom, type PnlPeriod, type PnlPoint,
} from '../../utils/pnlChart'

// Gráfico de rentabilidad acumulada del Dashboard (#166), sobre
// GET /api/v1/pnl/daily. Mientras el backend descarga precios de cierre
// (`refreshing`) se reconsulta cada 5 s; después, cada minuto para el día en curso.

const signed = (n: number, digits = 2) => `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`
const signedEur = (n: number) => `${n >= 0 ? '+' : ''}${formatEur(n)}`

function fmtAxisDate(date: string, period: PnlPeriod): string {
  const d = new Date(`${date}T12:00:00Z`)
  return period === '7D' || period === '30D'
    ? d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', timeZone: 'Europe/Madrid' })
    : d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit', timeZone: 'Europe/Madrid' })
}

function fmtLongDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' })
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: PnlPoint }[] }) {
  if (!active || !payload?.[0]) return null
  const p = payload[0].payload
  const color = p.pct >= 0 ? 'text-accent-green' : 'text-accent-red'
  return (
    <div className="bg-gray-950/95 border border-white/10 rounded-xl px-3 py-2.5 shadow-xl text-xs space-y-0.5">
      <p className="text-gray-400">{fmtLongDate(p.date)}{p.live ? ' · en vivo' : ''}</p>
      <p className={`mono font-semibold ${color}`}>{signed(p.pct)}</p>
      <p className="text-gray-300 mono">{signedEur(p.pnl)} acumulado</p>
    </div>
  )
}

export function PnlChart({ headerLeft }: { headerLeft?: ReactNode }) {
  const [period, setPeriod] = useState<PnlPeriod>('Todo')
  const from = periodFrom(period, madridToday())

  const { data, isLoading, isError } = useQuery({
    queryKey: ['daily-pnl', from ?? 'all'],
    queryFn: () => portfolioApi.getDailyPnl(from),
    refetchInterval: (query) => (query.state.data?.refreshing ? 5_000 : 60_000),
  })

  const series = useMemo(() => buildPnlSeries(data?.days ?? [], period), [data, period])
  const metric = METRIC_LABELS[metricFor(period)]
  const last = series[series.length - 1]
  const positive = (last?.pct ?? 0) >= 0
  const color = positive ? '#00c896' : '#e74c3c'

  return (
    <div className="bg-background-card border border-border rounded-2xl px-5 py-5">
      <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
        {headerLeft}
        <div className="flex gap-1" role="group" aria-label="Periodo del gráfico de rentabilidad">
          {PNL_PERIODS.map(p => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/60 ${
                period === p ? 'bg-white/10 text-white' : 'text-gray-600 hover:text-gray-400'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4 min-h-[1.5rem] flex-wrap" aria-live="polite">
        {last && (
          <p className={`text-sm font-mono font-semibold ${positive ? 'text-accent-green' : 'text-accent-red'}`}>
            <span aria-hidden="true">{positive ? '▲' : '▼'} </span>
            {signed(last.pct)} <span className="text-xs font-normal opacity-80">({signedEur(last.pnl)})</span>
          </p>
        )}
        <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
          {metric.short}
          <InfoTooltip label={metric.short}>{metric.help}</InfoTooltip>
        </span>
        {data?.refreshing && (
          <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <span className="w-2.5 h-2.5 border border-gray-600 border-t-gray-400 rounded-full animate-spin" aria-hidden="true" />
            Descargando precios de cierre…
          </span>
        )}
      </div>

      <div className="h-52 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-600">Cargando…</div>
        )}
        {isError && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">No se pudo cargar la rentabilidad.</div>
        )}
        {!isLoading && !isError && series.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-600">Sin datos para este periodo</div>
        )}
        {series.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => fmtAxisDate(d, period)}
                tick={{ fontSize: 10, fill: '#4b5563' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#4b5563' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                width={44}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
              <RechartsTooltip content={<ChartTooltip />} />
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
    </div>
  )
}
