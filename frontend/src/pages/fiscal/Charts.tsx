import { TrendingUp, Calendar, Filter } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
  AreaChart, Area,
} from 'recharts'
import { formatEur, pnlColor } from '../../utils/format'
import { CryptoIcon } from '../../components/CryptoIcon'
import { PNL_THRESHOLD } from './constants'
import { FiscalChartCard } from './FiscalChartCard'
import type { YearOverview, MonthlyData, BreakdownItem } from './types'

function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { value: number; name?: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-background-card border border-border rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className={`font-bold mono ${(p.value ?? 0) >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
          {p.name && <span className="text-gray-500 font-normal mr-1">{p.name}</span>}
          {(p.value ?? 0) >= 0 ? '+' : ''}{formatEur(p.value ?? 0)}
        </p>
      ))}
    </div>
  )
}

export function ComparativaAnual({ data }: { data: YearOverview[] }) {
  if (data.length < 2) return null
  const chartData = data.map(d => ({ name: String(d.year), value: d.netoPatrimonial, en_curso: d.esAnioEnCurso }))
  const max = Math.max(...chartData.map(d => Math.abs(d.value)), 1)

  return (
    <FiscalChartCard icon={TrendingUp} title="Comparativa interanual — G/P neto">
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={chartData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
          <YAxis hide domain={[-max * 1.15, max * 1.15]} />
          <ReferenceLine y={0} stroke="#2a2d3e" strokeWidth={1} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={entry.value >= 0 ? '#10b981' : '#ef4444'} opacity={entry.en_curso ? 1 : 0.65} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </FiscalChartCard>
  )
}

export function EvolucionMensual({ data, esAnioEnCurso }: { data: MonthlyData; esAnioEnCurso: boolean }) {
  if (data.meses.length === 0) return null

  const max = Math.max(...data.meses.map(m => Math.abs(m.acumulado)), 1)
  const chartData = data.meses.map(m => ({ ...m, name: m.label }))
  const lastColor = data.meses[data.meses.length - 1]?.acumulado >= 0 ? '#10b981' : '#ef4444'

  return (
    <FiscalChartCard
      icon={TrendingUp}
      title="Evolución acumulada — mes a mes"
      right={esAnioEnCurso && data.proyeccionFinAnio !== null && (
        <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-xl border ${
          data.proyeccionFinAnio >= 0
            ? 'bg-accent-green/10 border-accent-green/20 text-accent-green'
            : 'bg-accent-red/10 border-accent-red/20 text-accent-red'
        }`}>
          <Calendar size={11} />
          <span>Proyección dic: <span className="font-bold mono">{data.proyeccionFinAnio >= 0 ? '+' : ''}{formatEur(data.proyeccionFinAnio)}</span></span>
        </div>
      )}
    >
      <ResponsiveContainer width="100%" height={130}>
        <AreaChart data={chartData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={lastColor} stopOpacity={0.15} />
              <stop offset="95%" stopColor={lastColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
          <YAxis hide domain={[-max * 1.2, max * 1.2]} />
          <ReferenceLine y={0} stroke="#2a2d3e" strokeWidth={1} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
          <Area type="monotone" dataKey="acumulado" stroke={lastColor} strokeWidth={2} fill="url(#areaGrad)" dot={false} activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    </FiscalChartCard>
  )
}

export function DesglosePorActivo({ data }: { data: BreakdownItem[] }) {
  if (data.length === 0) return null
  const max = Math.max(...data.map(d => Math.max(d.ganancias, Math.abs(d.perdidas))), 1)

  return (
    <FiscalChartCard icon={Filter} title="Desglose G/P por activo">
      <div className="space-y-2">
        {data.map((item) => {
          const barG = (item.ganancias / max) * 100
          const barP = (Math.abs(item.perdidas) / max) * 100
          return (
            <div key={item.asset} className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-20 shrink-0">
                <CryptoIcon symbol={item.asset} size={16} />
                <span className="text-xs font-bold mono text-gray-300">{item.asset}</span>
              </div>
              <div className="flex-1 flex items-center gap-1 h-5">
                <div className="flex-1 flex justify-end">
                  {item.perdidas < -PNL_THRESHOLD && (
                    <div className="h-3 rounded-l bg-accent-red/70" style={{ width: `${barP}%` }} />
                  )}
                </div>
                <div className="w-px h-4 bg-border shrink-0" />
                <div className="flex-1">
                  {item.ganancias > PNL_THRESHOLD && (
                    <div className="h-3 rounded-r bg-accent-green/70" style={{ width: `${barG}%` }} />
                  )}
                </div>
              </div>
              <div className={`w-24 text-right text-xs mono font-bold shrink-0 ${pnlColor(item.neto)}`}>
                {item.neto >= 0 ? '+' : ''}{formatEur(item.neto)}
              </div>
            </div>
          )
        })}
      </div>
    </FiscalChartCard>
  )
}
