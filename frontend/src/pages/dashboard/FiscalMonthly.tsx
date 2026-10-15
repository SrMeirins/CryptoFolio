import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis } from 'recharts'
import type { MesData } from '../fiscal/types'
import { formatEur } from '../../utils/format'
import { useChartColors } from '../../hooks/useChartColors'
import { useReducedMotion } from '../../hooks/useReducedMotion'

// G/P realizado de cada mes del ejercicio (#236): barras verdes o rojas según
// el signo, con el acumulado en el tooltip. Ocupa el alto disponible del panel.

const signed = (n: number) => `${n > 0 ? '+' : ''}${formatEur(n)}`

export function FiscalMonthly({ meses }: { meses: MesData[] }) {
  const c = useChartColors()
  const reduceMotion = useReducedMotion()
  if (meses.length === 0) return null
  const last = meses[meses.length - 1]
  return (
    <div className="flex flex-col flex-1 min-h-28">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-[10px] uppercase tracking-wider text-fg-subtle">G/P por mes</p>
        <p className="text-[11px] text-fg-subtle">acumulado <span className={`mono font-semibold ${last.acumulado >= 0 ? 'text-positive' : 'text-negative'}`}>{signed(last.acumulado)}</span></p>
      </div>
      <div className="flex-1 min-h-24" role="img"
        aria-label={`G/P realizado por mes: ${meses.map(m => `${m.label} ${signed(m.netoMes)}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={meses} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: c.axis }} axisLine={false} tickLine={false} interval={0} />
            <ReferenceLine y={0} stroke={c.grid} />
            <RechartsTooltip cursor={{ fill: c.cursorSoft }} content={({ active, payload }) => {
              const m = active && payload?.[0]?.payload as MesData | undefined
              return m ? (
                <div className="bg-tooltip/95 border border-overlay/10 rounded-lg px-2.5 py-1.5 text-xs shadow-xl">
                  <p className="text-fg-muted capitalize">{m.label}</p>
                  <p className={`mono font-semibold ${m.netoMes >= 0 ? 'text-positive' : 'text-negative'}`}>{signed(m.netoMes)}</p>
                  <p className="mono text-fg-subtle">acumulado {signed(m.acumulado)}</p>
                </div>
              ) : null
            }} />
            <Bar dataKey="netoMes" radius={[3, 3, 3, 3]} isAnimationActive={!reduceMotion} animationDuration={600}>
              {meses.map(m => <Cell key={m.mes} fill={m.netoMes >= 0 ? c.up : c.down} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
