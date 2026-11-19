import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bar, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts'
import type { MesData } from '../fiscal/types'
import { formatEurSigned } from '../../utils/format'
import { niceTicks } from '../../utils/chartAxes'
import { useChartColors } from '../../hooks/useChartColors'
import { useReducedMotion } from '../../hooks/useReducedMotion'

// G/P realizado de cada mes del ejercicio (#236; desde #515 con el acumulado
// y meses pulsables): barras verdes o rojas según el signo y la línea del
// acumulado con su propio eje. Pulsar una barra, o el nombre de su mes bajo el
// gráfico (accesible con teclado), abre Operaciones de Fiscal de ese mes.

const signed = formatEurSigned

export function FiscalMonthly({ meses, year, enlaceMes }: {
  meses: MesData[]
  year: number
  enlaceMes: (mes: number) => string
}) {
  const c = useChartColors()
  const reduceMotion = useReducedMotion()
  const navigate = useNavigate()
  const ticksMes = useMemo(() => niceTicks(Math.min(0, ...meses.map(m => m.netoMes)), Math.max(0, ...meses.map(m => m.netoMes)), 3, true), [meses])
  const ticksAcum = useMemo(() => niceTicks(Math.min(0, ...meses.map(m => m.acumulado)), Math.max(0, ...meses.map(m => m.acumulado)), 3, true), [meses])
  if (meses.length === 0) return null
  const last = meses[meses.length - 1]
  const nombreMes = (m: MesData) => new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, m.mes - 1, 1)))
  return (
    <div className="flex flex-col flex-1 min-h-36" data-testid="fiscal-mensual">
      <div className="flex items-baseline justify-between mb-1 gap-3 flex-wrap">
        <p className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-fg-subtle">
          <span>Resultado por mes</span>
          <span className="normal-case tracking-normal inline-flex items-center gap-1"><span aria-hidden="true" className="inline-block w-3 h-0.5 rounded-full bg-brand" />acumulado</span>
        </p>
        <p className="text-[11px] text-fg-subtle">acumulado <span className={`mono font-semibold ${last.acumulado >= 0 ? 'text-positive-ink' : 'text-negative-ink'}`}>{signed(last.acumulado)}</span></p>
      </div>
      <div className="flex-1 min-h-24" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={meses} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} className="cursor-pointer"
            onClick={(s: { activeTooltipIndex?: number } | null) => {
              const m = typeof s?.activeTooltipIndex === 'number' ? meses[s.activeTooltipIndex] : undefined
              if (m) navigate(enlaceMes(m.mes))
            }}>
            <XAxis dataKey="label" hide />
            <YAxis yAxisId="mes" hide domain={[ticksMes[0], ticksMes[ticksMes.length - 1]]} />
            <YAxis yAxisId="acum" hide orientation="right" domain={[ticksAcum[0], ticksAcum[ticksAcum.length - 1]]} />
            <ReferenceLine yAxisId="mes" y={0} stroke={c.grid} />
            <RechartsTooltip cursor={{ fill: c.cursorSoft }} content={({ active, payload }) => {
              const m = active && payload?.[0]?.payload as MesData | undefined
              return m ? (
                <div className="bg-background-card border border-border rounded-lg px-2.5 py-1.5 text-xs shadow-xl">
                  <p className="text-fg-muted capitalize">{nombreMes(m)} de {year}</p>
                  <p className={`mono font-semibold ${m.netoMes >= 0 ? 'text-positive-ink' : 'text-negative-ink'}`}>{signed(m.netoMes)}</p>
                  <p className="text-fg-subtle">{m.operacionesMes} {m.operacionesMes === 1 ? 'operación' : 'operaciones'}</p>
                  <p className="mono text-fg-subtle">acumulado {signed(m.acumulado)}</p>
                  <p className="mt-1 text-fg-subtle">Pulsa para ver sus operaciones</p>
                </div>
              ) : null
            }} />
            <Bar yAxisId="mes" dataKey="netoMes" radius={[3, 3, 3, 3]} isAnimationActive={!reduceMotion} animationDuration={600}>
              {meses.map(m => <Cell key={m.mes} fill={m.netoMes >= 0 ? c.up : c.down} />)}
            </Bar>
            <Line yAxisId="acum" type="monotone" dataKey="acumulado" stroke={c.brand} strokeWidth={1.75} dot={false}
              activeDot={{ r: 3, fill: c.brand, strokeWidth: 0 }} isAnimationActive={!reduceMotion} animationDuration={700} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {/* Meses como enlaces: el mismo destino que pulsar su barra, también con teclado. */}
      <ol aria-label={`Resultado por mes de ${year}`} className="flex mt-1">
        {meses.map(m => (
          <li key={m.mes} className="flex-1 min-w-0 text-center">
            <Link to={enlaceMes(m.mes)}
              aria-label={`${nombreMes(m)} de ${year}: ${signed(m.netoMes)}, ${m.operacionesMes} ${m.operacionesMes === 1 ? 'operación' : 'operaciones'}. Ver sus operaciones en Fiscal`}
              className="inline-flex items-center justify-center h-6 min-w-6 px-0.5 rounded text-[10px] text-fg-subtle capitalize hover:text-fg hover:bg-overlay/5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
              {m.label}
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}
