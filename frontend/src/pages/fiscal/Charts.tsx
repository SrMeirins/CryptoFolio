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
import { useChartColors } from '../../hooks/useChartColors'
import { cardClasses } from '../../components/ui'

function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { value: number; name?: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className={cardClasses('none', 'px-3 py-2 text-xs shadow-lg')}>
      <p className="text-fg-muted mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className={`font-bold mono ${(p.value ?? 0) >= 0 ? 'text-positive' : 'text-negative'}`}>
          {p.name && <span className="text-fg-subtle font-normal mr-1">{p.name}</span>}
          {(p.value ?? 0) >= 0 ? '+' : ''}{formatEur(p.value ?? 0)}
        </p>
      ))}
    </div>
  )
}

export function ComparativaAnual({ data }: { data: YearOverview[] }) {
  const c = useChartColors()
  if (data.length < 2) return null
  const chartData = data.map(d => ({ name: String(d.year), value: d.netoPatrimonial, en_curso: d.esAnioEnCurso }))
  const max = Math.max(...chartData.map(d => Math.abs(d.value)), 1)

  return (
    <FiscalChartCard icon={TrendingUp} title="Comparativa interanual — G/P neto">
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={chartData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: c.axisMuted }} axisLine={false} tickLine={false} />
          <YAxis hide domain={[-max * 1.15, max * 1.15]} />
          <ReferenceLine y={0} stroke={c.gridStrong} strokeWidth={1} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: c.cursorSoft }} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={entry.value >= 0 ? c.gain : c.loss} opacity={entry.en_curso ? 1 : 0.65} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </FiscalChartCard>
  )
}

export function EvolucionMensual({ data, esAnioEnCurso }: { data: MonthlyData; esAnioEnCurso: boolean }) {
  const c = useChartColors()
  if (data.meses.length === 0) return null

  const max = Math.max(...data.meses.map(m => Math.abs(m.acumulado)), 1)
  const chartData = data.meses.map(m => ({ ...m, name: m.label }))
  const lastColor = data.meses[data.meses.length - 1]?.acumulado >= 0 ? c.gain : c.loss

  return (
    <FiscalChartCard
      icon={TrendingUp}
      title="Evolución acumulada — mes a mes"
      right={esAnioEnCurso && data.proyeccionFinAnio !== null && (
        <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-xl border ${
          data.proyeccionFinAnio >= 0
            ? 'bg-positive/10 border-positive/20 text-positive'
            : 'bg-negative/10 border-negative/20 text-negative'
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
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: c.axisMuted }} axisLine={false} tickLine={false} />
          <YAxis hide domain={[-max * 1.2, max * 1.2]} />
          <ReferenceLine y={0} stroke={c.gridStrong} strokeWidth={1} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: c.cursorLine }} />
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
                <span className="text-xs font-bold mono text-fg">{item.asset}</span>
              </div>
              <div className="flex-1 flex items-center gap-1 h-5">
                <div className="flex-1 flex justify-end">
                  {item.perdidas < -PNL_THRESHOLD && (
                    <div className="h-3 rounded-l bg-negative/70" style={{ width: `${barP}%` }} />
                  )}
                </div>
                <div className="w-px h-4 bg-border shrink-0" />
                <div className="flex-1">
                  {item.ganancias > PNL_THRESHOLD && (
                    <div className="h-3 rounded-r bg-positive/70" style={{ width: `${barG}%` }} />
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
