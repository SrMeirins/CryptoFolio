import { useMemo, useState, type ReactNode } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { InfoTooltip } from '../../components/InfoTooltip'
import { formatMoney, type Currency, formatPercent } from '../../utils/format'
import { useCurrencyQuery } from '../../hooks/useCurrencyQuery'
import { dailyPnlQuery } from '../../queries/currencyQueries'
import {
  PNL_PERIODS, METRIC_LABELS, buildPnlSeries, madridToday, metricFor, periodFrom, type PnlPeriod, type PnlPoint,
} from '../../utils/pnlChart'
import { useChartColors } from '../../hooks/useChartColors'
import { SegmentedControl, cardClasses } from '../../components/ui'

// Gráfico de rentabilidad acumulada del Dashboard (#166), sobre
// GET /api/v1/pnl/daily. Mientras el backend descarga precios de cierre
// (`refreshing`) se reconsulta cada 5 s; después, cada minuto para el día en curso.

const signed = (n: number, digits = 2) => formatPercent(n, digits, true)
const signedMoney = (n: number, currency: Currency) => `${n >= 0 ? '+' : ''}${formatMoney(n, currency)}`

function fmtAxisDate(date: string, period: PnlPeriod): string {
  const d = new Date(`${date}T12:00:00Z`)
  return period === '7D' || period === '30D'
    ? d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', timeZone: 'Europe/Madrid' })
    : d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit', timeZone: 'Europe/Madrid' })
}

function fmtLongDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' })
}

function ChartTooltip({ active, payload, currency }: { active?: boolean; payload?: { payload: PnlPoint }[]; currency: Currency }) {
  if (!active || !payload?.[0]) return null
  const p = payload[0].payload
  const color = p.pct >= 0 ? 'text-positive' : 'text-negative'
  return (
    <div className="bg-tooltip/95 border border-overlay/10 rounded-xl px-3 py-2.5 shadow-xl text-xs space-y-0.5">
      <p className="text-fg-muted">{fmtLongDate(p.date)}{p.live ? ' · en vivo' : ''}</p>
      <p className={`mono font-semibold ${color}`}>{signed(p.pct)}</p>
      <p className="text-fg mono">{signedMoney(p.pnl, currency)} acumulado</p>
    </div>
  )
}

export function PnlChart({ headerLeft }: { headerLeft?: ReactNode }) {
  const c = useChartColors()
  const [period, setPeriod] = useState<PnlPeriod>('Todo')
  const from = periodFrom(period, madridToday())

  // En la moneda de visualización; la otra se precarga para que el toggle sea instantáneo (#177).
  const { data, isLoading, isError, currency: requested } = useCurrencyQuery(
    currency => dailyPnlQuery(currency, from),
    { refetchInterval: (query) => (query.state.data?.refreshing ? 5_000 : 60_000) },
  )
  const currency = data?.currency ?? requested

  const series = useMemo(() => buildPnlSeries(data?.days ?? [], period), [data, period])
  const metric = METRIC_LABELS[metricFor(period)]
  const last = series[series.length - 1]
  const positive = (last?.pct ?? 0) >= 0
  const color = positive ? c.up : c.down

  return (
    <div className={cardClasses('none', 'px-5 py-5')}>
      <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
        {headerLeft}
        <SegmentedControl label="Periodo del gráfico de rentabilidad" value={period} onChange={setPeriod}
          options={PNL_PERIODS.map(p => ({ value: p, label: p }))} />
      </div>

      <div className="flex items-center gap-3 mb-4 min-h-6 flex-wrap" aria-live="polite">
        {last && (
          <p className={`text-sm mono font-semibold ${positive ? 'text-positive' : 'text-negative'}`}>
            <span aria-hidden="true">{positive ? '▲' : '▼'} </span>
            {signed(last.pct)} <span className="text-xs font-normal opacity-80">({signedMoney(last.pnl, currency)})</span>
          </p>
        )}
        <span className="inline-flex items-center gap-1 text-xs text-fg-subtle">
          {metric.short}
          <InfoTooltip label={metric.short}>{metric.help}</InfoTooltip>
        </span>
        {data?.refreshing && (
          <span className="flex items-center gap-1.5 text-xs text-fg-subtle">
            <span className="w-2.5 h-2.5 border border-border border-t-gray-400 rounded-full animate-spin" aria-hidden="true" />
            Descargando precios de cierre…
          </span>
        )}
      </div>

      <div className="h-52 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-fg-subtle">Cargando…</div>
        )}
        {isError && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-fg-subtle">No se pudo cargar la rentabilidad.</div>
        )}
        {!isLoading && !isError && series.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-fg-subtle">Sin datos para este periodo</div>
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
              <CartesianGrid vertical={false} stroke={c.grid} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => fmtAxisDate(d, period)}
                tick={{ fontSize: 12, fill: c.axis }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 12, fill: c.axis }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => formatPercent(v, 0)}
                width={44}
              />
              <ReferenceLine y={0} stroke={c.cursor} strokeDasharray="3 3" />
              <RechartsTooltip content={<ChartTooltip currency={currency} />} />
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
