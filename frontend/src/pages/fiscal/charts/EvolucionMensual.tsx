import { useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, CartesianGrid } from 'recharts'
import { formatEur, formatMoneyCompact } from '../../../utils/format'
import { mensualSeries, type MonthBar } from '../../../utils/fiscalCharts'
import { useChartColors } from '../../../hooks/useChartColors'
import { useReducedMotion } from '../../../hooks/useReducedMotion'
import { FiscalChartCard } from '../FiscalChartCard'
import { AxisButtonTick } from './AxisButtonTick'
import type { MonthlyData } from '../types'

// Evolución mensual (#301): barra con el resultado de cada mes y línea del
// acumulado. Los meses que aún no han llegado se ven vacíos. Pulsar un mes
// abre sus operaciones.

const LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const signed = (v: number) => `${v >= 0 ? '+' : ''}${formatEur(v)}`

function MonthTooltip({ active, payload }: { active?: boolean; payload?: { payload: MonthBar }[] }) {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload
  if (d.futuro) return null
  return (
    <div className="glass-tooltip rounded-xl px-3 py-2 text-xs space-y-0.5 tabular-nums">
      <p className="text-fg-muted mb-1 capitalize">{LONG[d.mes - 1]}</p>
      <p className="flex justify-between gap-4"><span className="text-fg-subtle">Mes</span><span className={`mono ${(d.neto ?? 0) >= 0 ? 'text-positive' : 'text-negative'}`}>{signed(d.neto ?? 0)}</span></p>
      <p className="flex justify-between gap-4"><span className="text-fg-subtle">Acumulado</span><span className="mono text-fg">{signed(d.acumulado ?? 0)}</span></p>
      <p className="text-fg-subtle pt-1">Pulsa para ver sus operaciones</p>
    </div>
  )
}

export function EvolucionMensual({ data, onSelectMonth }: { data: MonthlyData; onSelectMonth: (month: number) => void }) {
  const c = useChartColors()
  const reduceMotion = useReducedMotion()
  // Con poco ancho, la inicial del mes: los 12 nombres cortos se solapan (#301).
  const [narrow, setNarrow] = useState(false)
  if (data.meses.length === 0) return null
  const series = mensualSeries(data.meses)
  const isFuture = (v: string | number) => series.find(s => s.label === v)?.futuro ?? true
  const select = (v: string | number) => { const m = series.find(s => s.label === v); if (m && !m.futuro) onSelectMonth(m.mes) }
  const last = [...series].reverse().find(s => !s.futuro)

  return (
    <FiscalChartCard icon={TrendingUp} title="Evolución mensual"
      right={last && <span className="text-xs text-fg-subtle">Acumulado: <span className={`mono font-semibold ${(last.acumulado ?? 0) >= 0 ? 'text-positive' : 'text-negative'}`}>{signed(last.acumulado ?? 0)}</span></span>}>
      <div className="h-52" role="group" aria-label={`Resultado por mes y acumulado: ${series.filter(s => !s.futuro).map(s => `${LONG[s.mes - 1]} ${signed(s.neto ?? 0)}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%" onResize={(w: number) => setNarrow(w < 480)}>
          <ComposedChart data={series} margin={{ top: 10, right: 8, left: 0, bottom: 4 }}
            onClick={(s: { activePayload?: { payload: MonthBar }[] }) => { const m = s?.activePayload?.[0]?.payload; if (m && !m.futuro) onSelectMonth(m.mes) }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} interval={0} height={28}
              tick={<AxisButtonTick label={v => (narrow ? String(v).charAt(0).toUpperCase() : String(v))} describe={v => `Ver las operaciones de ${LONG[series.findIndex(s => s.label === v)]}`}
                onActivate={select} disabled={isFuture} fill={c.axisMuted} activeFill={c.axis} />} />
            <YAxis tickFormatter={(v: number) => formatMoneyCompact(v, 'EUR')} tick={{ fontSize: 10, fill: c.axis }} axisLine={false} tickLine={false} width={64} />
            <ReferenceLine y={0} stroke={c.gridStrong} />
            <Tooltip content={<MonthTooltip />} cursor={{ fill: c.cursorSoft }} />
            <Bar dataKey="neto" maxBarSize={22} radius={[3, 3, 3, 3]} isAnimationActive={!reduceMotion} cursor="pointer">
              {series.map(s => <Cell key={s.mes} fill={(s.neto ?? 0) >= 0 ? c.gain : c.loss} fillOpacity={0.8} />)}
            </Bar>
            <Line dataKey="acumulado" type="monotone" stroke="var(--cf-brand)" strokeWidth={2} dot={{ r: 2.5, strokeWidth: 0, fill: 'var(--cf-brand)' }}
              connectNulls={false} isAnimationActive={!reduceMotion} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="flex items-center gap-4 flex-wrap text-[11px] text-fg-subtle mt-2">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-positive" aria-hidden="true" />/<span className="w-2.5 h-2.5 rounded-sm bg-negative" aria-hidden="true" />Resultado del mes</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-0.5 bg-brand" aria-hidden="true" />Acumulado</span>
      </p>
    </FiscalChartCard>
  )
}
