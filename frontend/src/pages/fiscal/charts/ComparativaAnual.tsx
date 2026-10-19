import { TrendingUp } from 'lucide-react'
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, CartesianGrid, LabelList } from 'recharts'
import { formatEur, formatMoneyCompact } from '../../../utils/format'
import { comparativaSeries, type YearBar } from '../../../utils/fiscalCharts'
import { useChartColors } from '../../../hooks/useChartColors'
import { useReducedMotion } from '../../../hooks/useReducedMotion'
import { FiscalChartCard } from '../FiscalChartCard'
import { AxisButtonTick } from './AxisButtonTick'
import type { YearOverview } from '../types'

// Comparativa interanual (#301): ganancias hacia arriba, pérdidas hacia abajo
// y el neto como punto con su importe. Pulsar un año lo selecciona.

const signed = (v: number) => `${v >= 0 ? '+' : ''}${formatEur(v)}`

function YearTooltip({ active, payload }: { active?: boolean; payload?: { payload: YearBar }[] }) {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload
  return (
    <div className="glass-tooltip rounded-xl px-3 py-2 text-xs space-y-0.5 tabular-nums">
      <p className="text-fg-muted mb-1">{d.year}{d.enCurso ? ' · en curso' : ''}</p>
      <p className="flex justify-between gap-4"><span className="text-fg-subtle">Ganancias</span><span className="mono text-positive">+{formatEur(d.ganancias)}</span></p>
      <p className="flex justify-between gap-4"><span className="text-fg-subtle">Pérdidas</span><span className="mono text-negative">{formatEur(d.perdidas)}</span></p>
      <p className="flex justify-between gap-4 font-semibold"><span className="text-fg-subtle">Neto</span><span className={`mono ${d.neto >= 0 ? 'text-positive' : 'text-negative'}`}>{signed(d.neto)}</span></p>
    </div>
  )
}

export function ComparativaAnual({ data, activeYear, onSelectYear }: { data: YearOverview[]; activeYear: number; onSelectYear: (year: number) => void }) {
  const c = useChartColors()
  const reduceMotion = useReducedMotion()
  if (data.length < 2) return null
  const series = comparativaSeries(data)
  const select = (v: string | number) => onSelectYear(Number(v))

  return (
    <FiscalChartCard icon={TrendingUp} title="Comparativa interanual">
      <div className="h-52" role="group" aria-label={`Ganancias, pérdidas y neto por año: ${series.map(s => `${s.year} ${signed(s.neto)}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series} stackOffset="sign" margin={{ top: 22, right: 8, left: 0, bottom: 4 }}
            onClick={(s: { activePayload?: { payload: YearBar }[] }) => { const y = s?.activePayload?.[0]?.payload.year; if (y) onSelectYear(y) }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey="year" axisLine={false} tickLine={false} interval={0} height={28}
              tick={<AxisButtonTick label={v => String(v)} describe={v => `Ver el ejercicio ${v}`} onActivate={select}
                active={v => Number(v) === activeYear} fill={c.axisMuted} activeFill={c.axis} />} />
            <YAxis tickFormatter={(v: number) => formatMoneyCompact(v, 'EUR')} tick={{ fontSize: 10, fill: c.axis }} axisLine={false} tickLine={false} width={64} />
            <ReferenceLine y={0} stroke={c.gridStrong} />
            <Tooltip content={<YearTooltip />} cursor={{ fill: c.cursorSoft }} />
            <Bar dataKey="ganancias" stackId="gp" maxBarSize={36} radius={[4, 4, 0, 0]} isAnimationActive={!reduceMotion} cursor="pointer">
              {series.map(s => <Cell key={s.year} fill={c.gain} fillOpacity={s.year === activeYear ? 0.95 : 0.45} />)}
              {/* El neto se escribe encima de cada columna, fuera de las barras */}
              <LabelList dataKey="neto" content={(props: { x?: number | string; y?: number | string; width?: number | string; value?: number | string; index?: number }) => {
                const x = Number(props.x ?? 0), y = Number(props.y ?? 0), w = Number(props.width ?? 0), v = Number(props.value ?? 0)
                const active = series[props.index ?? -1]?.year === activeYear
                return <text x={x + w / 2} y={y - 6} textAnchor="middle" fontSize={10} fontWeight={active ? 700 : 500} fill={v >= 0 ? c.gain : c.loss}>{signed(v)}</text>
              }} />
            </Bar>
            <Bar dataKey="perdidas" stackId="gp" maxBarSize={36} radius={[4, 4, 0, 0]} isAnimationActive={!reduceMotion} cursor="pointer">
              {series.map(s => <Cell key={s.year} fill={c.loss} fillOpacity={s.year === activeYear ? 0.95 : 0.45} />)}
            </Bar>
            {/* Neto como línea fina (#313): el rombo se montaba sobre las barras */}
            <Line dataKey="neto" type="linear" stroke={c.axis} strokeWidth={1.5} strokeDasharray="3 3"
              dot={{ r: 2.5, strokeWidth: 0, fill: c.axis }} activeDot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {/* Leyenda: el color no es la única pista */}
      <p className="flex items-center gap-4 flex-wrap text-[11px] text-fg-subtle mt-2">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-positive" aria-hidden="true" />Ganancias (arriba)</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-negative" aria-hidden="true" />Pérdidas (abajo)</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-fg-muted" aria-hidden="true" />Neto</span>
      </p>
    </FiscalChartCard>
  )
}
