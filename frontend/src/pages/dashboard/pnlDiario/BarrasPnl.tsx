import { useMemo } from 'react'
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts'
import { formatMoney, formatMoneyCompact, type Currency } from '../../../utils/format'
import { niceTicks } from '../../../utils/chartAxes'
import type { Agrupacion, BarraPnl } from '../../../utils/pnlPeriodo'
import { etiquetaEje, nombreAgrupacion, tituloBarra } from '../../../utils/pnlPeriodoTexto'
import { useChartColors } from '../../../hooks/useChartColors'
import { useReducedMotion } from '../../../hooks/useReducedMotion'
import { useTransientFlag } from '../../../hooks/useTransientFlag'
import { signedMoney } from '../calendar/format'

// Gráfico del periodo del panel P&L diario (#511): una barra por día, semana o
// mes (verde si gana, roja si pierde) y la línea del acumulado con su propio
// eje a la derecha. La barra del día en curso va translúcida y con contorno
// discontinuo: su importe aún cambia. Las barras entran animadas al cambiar de
// periodo o de agrupación, salvo con «reducir movimiento». Con los importes
// ocultos se ven las formas, sin cifras en los ejes.

function TooltipBarra({ active, payload, agrupacion, currency }: {
  active?: boolean
  payload?: { payload: BarraPnl }[]
  agrupacion: Agrupacion
  currency: Currency
}) {
  if (!active || !payload?.[0]) return null
  const b = payload[0].payload
  const tono = (n: number) => (n > 0 ? 'text-positive' : n < 0 ? 'text-negative' : 'text-fg-muted')
  return (
    <div className="rounded-lg border border-border bg-background-card shadow-xl px-3 py-2 text-[11px] min-w-44">
      <p className="text-fg-subtle first-letter:uppercase">{tituloBarra(b, agrupacion)}{b.enCurso ? ', en curso' : ''}</p>
      <p className={`mt-0.5 mb-1 mono text-sm font-bold ${tono(b.pnl)}`}>{signedMoney(b.pnl, currency)}</p>
      <p className="flex justify-between gap-4">
        <span className="text-fg-subtle">Acumulado</span>
        <span className={`mono ${tono(b.acumulado)}`}>{signedMoney(b.acumulado, currency)}</span>
      </p>
      {b.enCurso && <p className="mt-1 text-fg-subtle">Hoy aún no ha cerrado: el importe cambia con los precios.</p>}
    </div>
  )
}

export function BarrasPnl({ barras, agrupacion, currency, oculto, animationKey, onHover, onAbrir }: {
  barras: readonly BarraPnl[]
  agrupacion: Agrupacion
  currency: Currency
  /** Importes ocultos: sin cifras en los ejes. */
  oculto: boolean
  /** Cambia al elegir otro periodo o agrupación: las barras vuelven a entrar. */
  animationKey: string
  /** Día bajo el ratón (solo en la agrupación diaria), para resaltarlo en el calendario. */
  onHover?: (date: string | null) => void
  onAbrir?: (barra: BarraPnl) => void
}) {
  const c = useChartColors()
  const reduceMotion = useReducedMotion()
  const animating = useTransientFlag(animationKey, 1200)
  const ticksBarras = useMemo(() => {
    const vals = barras.map(b => b.pnl)
    return vals.length ? niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), 4, true) : []
  }, [barras])
  const ticksAcum = useMemo(() => {
    const vals = barras.map(b => b.acumulado)
    return vals.length ? niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), 4, true) : []
  }, [barras])
  const eje = (v: number) => formatMoneyCompact(v, currency)
  const tick = oculto ? false : { fontSize: 11, fill: c.axis }
  const ultimo = barras[barras.length - 1]
  const indice = (s: { activeTooltipIndex?: number } | null) => (typeof s?.activeTooltipIndex === 'number' ? barras[s.activeTooltipIndex] : undefined)

  return (
    <div role="img" data-testid="barras-pnl-periodo" className="h-[220px]"
      aria-label={`P&L por ${nombreAgrupacion(agrupacion)}: ${barras.length} barras; acumulado del periodo ${ultimo ? signedMoney(ultimo.acumulado, currency) : formatMoney(0, currency)}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={barras as BarraPnl[]} margin={{ top: 8, right: 0, left: 0, bottom: 0 }} barCategoryGap="18%"
          onMouseMove={s => onHover?.(agrupacion === 'dia' ? indice(s)?.desde ?? null : null)}
          onMouseLeave={() => onHover?.(null)}
          onClick={s => { const b = indice(s); if (b) onAbrir?.(b) }}
          className={onAbrir ? 'cursor-pointer' : undefined}>
          <CartesianGrid vertical={false} stroke={c.grid} strokeOpacity={0.6} />
          <XAxis dataKey="key" tickFormatter={(k: string) => etiquetaEje(k, agrupacion)} tick={{ fontSize: 11, fill: c.axis }}
            axisLine={false} tickLine={false} tickMargin={8} minTickGap={24} interval="preserveStartEnd" />
          <YAxis yAxisId="barras" domain={[ticksBarras[0], ticksBarras[ticksBarras.length - 1]]} ticks={ticksBarras} interval={0}
            tickFormatter={eje} tick={tick} axisLine={false} tickLine={false} width={oculto ? 8 : 64} />
          <YAxis yAxisId="acumulado" orientation="right" domain={[ticksAcum[0], ticksAcum[ticksAcum.length - 1]]} ticks={ticksAcum} interval={0}
            tickFormatter={eje} tick={tick} axisLine={false} tickLine={false} width={oculto ? 8 : 64} />
          <ReferenceLine yAxisId="barras" y={0} stroke={c.axis} strokeOpacity={0.6} />
          <RechartsTooltip cursor={{ fill: c.cursorSoft }}
            content={<TooltipBarra agrupacion={agrupacion} currency={currency} />} />
          <Bar yAxisId="barras" dataKey="pnl" name="P&L" maxBarSize={22} radius={[3, 3, 0, 0]}
            isAnimationActive={!reduceMotion && animating} animationDuration={600} animationEasing="ease-out">
            {barras.map(b => {
              const color = b.pnl >= 0 ? c.up : c.down
              return <Cell key={b.key} fill={color} fillOpacity={b.enCurso ? 0.4 : 0.9}
                stroke={b.enCurso ? color : 'none'} strokeDasharray={b.enCurso ? '3 2' : undefined} strokeWidth={b.enCurso ? 1.25 : 0} />
            })}
          </Bar>
          <Line yAxisId="acumulado" type="monotone" dataKey="acumulado" name="Acumulado" stroke={c.brand} strokeWidth={2}
            dot={false} activeDot={{ r: 3.5, fill: c.brand, strokeWidth: 0 }}
            isAnimationActive={!reduceMotion && animating} animationDuration={800} animationEasing="ease-out" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
