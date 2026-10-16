import { useId, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import type { SimulationCurvePoint } from '../api/portfolio'
import { formatEur, formatMoneyCompact, formatNumber, formatPrice } from '../utils/format'
import { zeroSplit } from '../utils/zeroSplit'
import { useChartColors } from '../hooks/useChartColors'
import { useReducedMotion } from '../hooks/useReducedMotion'

// Gráfico del simulador de venta (#280): ganancia o pérdida tras comisión e
// IRPF según el precio de venta, con marcas del precio actual, del break-even
// y del elegido. Pulsar sobre la curva fija ese precio.

function CurveTooltip({ active, payload }: { active?: boolean; payload?: { payload: SimulationCurvePoint }[] }) {
  if (!active || !payload?.[0]) return null
  const p = payload[0].payload
  return (
    <div className="glass-tooltip rounded-xl px-3 py-2 text-xs space-y-0.5 tabular-nums">
      <p className="text-fg-muted mb-1">A {formatPrice(p.price)}</p>
      <p className="flex justify-between gap-4"><span className="text-fg-subtle">Resultado neto</span>
        <span className={`mono font-semibold ${p.resultadoNeto >= 0 ? 'text-positive' : 'text-negative'}`}>{p.resultadoNeto >= 0 ? '+' : ''}{formatEur(p.resultadoNeto)}</span></p>
      <p className="flex justify-between gap-4"><span className="text-fg-subtle">IRPF</span><span className="mono text-fg">{formatEur(p.irpf)}</span></p>
      <p className="flex justify-between gap-4"><span className="text-fg-subtle">Neto en mano</span><span className="mono text-fg">{formatEur(p.netoEnMano)}</span></p>
    </div>
  )
}

export function SaleSimulatorChart({ points, current, breakEven, chosen, onPick }: {
  points: SimulationCurvePoint[]
  current: number
  breakEven: number | null
  chosen: number
  onPick: (price: number) => void
}) {
  const c = useChartColors()
  const reduceMotion = useReducedMotion()
  const id = useId().replace(/:/g, '')
  const split = useMemo(() => zeroSplit(points.map(p => p.resultadoNeto)), [points])
  if (points.length < 2) return null

  return (
    <div className="h-48" role="img" aria-label="Resultado neto de la venta según el precio de venta">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 14, right: 8, left: 0, bottom: 0 }}
          onClick={(s: { activePayload?: { payload: SimulationCurvePoint }[] }) => {
            const p = s?.activePayload?.[0]?.payload
            if (p) onPick(p.price)
          }}
          style={{ cursor: 'crosshair' }}>
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor={c.up} stopOpacity={0.3} />
              <stop offset={split.fill} stopColor={c.up} stopOpacity={0.04} />
              <stop offset={split.fill} stopColor={c.down} stopOpacity={0.04} />
              <stop offset={1} stopColor={c.down} stopOpacity={0.3} />
            </linearGradient>
            <linearGradient id={`${id}-stroke`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={split.stroke ?? 0} stopColor={c.up} />
              <stop offset={split.stroke ?? 0} stopColor={c.down} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis dataKey="price" type="number" domain={['dataMin', 'dataMax']}
            tickFormatter={(v: number) => `${formatNumber(v, v < 1 ? 3 : 2)} €`}
            tick={{ fontSize: 11, fill: c.axis }} axisLine={false} tickLine={false} tickCount={5} />
          <YAxis tickFormatter={(v: number) => formatMoneyCompact(v, 'EUR')} tick={{ fontSize: 11, fill: c.axis }} axisLine={false} tickLine={false} width={64} />
          <ReferenceLine y={0} stroke={c.axis} strokeWidth={1.25} />
          {current > 0 && <ReferenceLine x={current} stroke={c.axis} strokeDasharray="4 4" label={{ value: 'Actual', position: 'top', fill: c.axis, fontSize: 10 }} />}
          {breakEven !== null && <ReferenceLine x={breakEven} stroke={c.axis} strokeDasharray="2 3" label={{ value: 'Break-even', position: 'insideTopLeft', fill: c.axis, fontSize: 10 }} />}
          {chosen > 0 && <ReferenceLine x={chosen} stroke="var(--cf-brand)" strokeWidth={2} />}
          <Tooltip content={<CurveTooltip />} cursor={{ stroke: c.cursorLine, strokeDasharray: '4 4' }} />
          <Area type="monotone" dataKey="resultadoNeto" baseValue={0}
            stroke={split.stroke === null ? (split.solid === 'up' ? c.up : c.down) : `url(#${id}-stroke)`} strokeWidth={2}
            fill={`url(#${id}-fill)`} dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive={!reduceMotion} animationDuration={500} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
