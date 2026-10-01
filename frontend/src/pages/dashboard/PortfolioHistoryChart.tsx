import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts'
import { portfolioApi } from '../../api/portfolio'
import { formatEur } from '../../utils/format'

const PERIODS = [
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: '1y', label: '1A' },
  { key: 'all', label: 'Todo' },
]

function fmtChartDate(dateStr: string, period: string): string {
  const d = new Date(dateStr)
  if (period === '1m')  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
  if (period === '3m')  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
  return d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
}

export function PortfolioHistoryChart({ currentValue }: { currentValue?: number }) {
  const [period, setPeriod] = useState('1y')

  const { data, isLoading } = useQuery({
    queryKey: ['portfolio-history', period],
    queryFn: () => portfolioApi.getPortfolioHistory(period),
    staleTime: 5 * 60_000,
    // Solo reintenta si hay pocos puntos (primera carga sin caché)
    refetchInterval: (query) => {
      const d = query.state.data as { points: {date:string;value:number}[]; refreshing: boolean } | undefined
      return (d?.refreshing && (d?.points?.length ?? 0) < 5) ? 30_000 : false
    },
  })

  // Envuelto en su propio useMemo: `data?.points ?? []` crea un array nuevo
  // en cada render donde `data.points` es undefined, lo que invalidaría la
  // memoización de abajo en cada render en vez de solo cuando cambian los
  // datos reales.
  const points = useMemo(() => data?.points ?? [], [data])

  const { minVal, maxVal, eurChange, isPositive } = useMemo(() => {
    if (points.length < 2) return { minVal: 0, maxVal: 0, eurChange: 0, isPositive: true }
    const last = currentValue ?? points[points.length - 1].value
    const vals = [...points.map(p => p.value)]
    if (currentValue != null) vals[vals.length - 1] = currentValue
    const minVal    = Math.min(...vals)
    const maxVal    = Math.max(...vals)
    const first     = points[0].value
    const eurChange = last - first
    return { minVal, maxVal, eurChange, isPositive: eurChange >= 0 }
  }, [points, currentValue])

  const color = isPositive ? '#00c896' : '#e74c3c'

  const today = new Date().toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
  const chartData = points.map((p, i) => ({
    date: i === points.length - 1 ? today : fmtChartDate(p.date, period),
    value: i === points.length - 1 && currentValue != null ? currentValue : p.value,
  }))

  return (
    <div className="bg-background-card border border-border rounded-2xl px-5 py-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[11px] text-gray-600 font-medium uppercase tracking-widest">Evolución del portfolio</h3>
        <div className="flex gap-1" role="tablist">
          {PERIODS.map(p => (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={period === p.key}
              onClick={() => setPeriod(p.key)}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors ${
                period === p.key
                  ? 'bg-white/10 text-white'
                  : 'text-gray-600 hover:text-gray-400'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Variación del periodo + estado de actualización */}
      <div className="flex items-center gap-3 mb-4">
        {points.length >= 2 && (
          <p className={`text-xs font-mono ${isPositive ? 'text-accent-green' : 'text-accent-red'}`}>
            {isPositive ? '▲' : '▼'} {eurChange >= 0 ? '+' : ''}{formatEur(eurChange)} en el periodo
          </p>
        )}
        {data?.refreshing && !isLoading && points.length < 5 && (
          <span className="flex items-center gap-1.5 text-[10px] text-gray-600">
            <span className="w-2.5 h-2.5 border border-gray-600 border-t-gray-400 rounded-full animate-spin" />
            Cargando histórico…
          </span>
        )}
      </div>

      {/* Gráfico */}
      <div className="h-52 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-2">
              <div className="w-5 h-5 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
              <span className="text-xs text-gray-600">Cargando…</span>
            </div>
          </div>
        )}

        {!isLoading && points.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-gray-600">Sin datos para este periodo</p>
          </div>
        )}

        {points.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="histGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={color} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={color} stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#4b5563' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[minVal * 0.97, maxVal * 1.02]}
                tick={{ fontSize: 10, fill: '#4b5563' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => formatEur(v)}
                width={72}
              />
              <RechartsTooltip
                contentStyle={{
                  background: '#0f1117',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 10,
                  fontSize: 12,
                }}
                labelStyle={{ color: '#9ca3af', marginBottom: 4 }}
                formatter={(v: number) => [formatEur(v), 'Valor']}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                fill="url(#histGradient)"
                dot={false}
                activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
