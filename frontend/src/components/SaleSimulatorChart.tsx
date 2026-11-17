import { useId, useMemo, useRef, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceDot, ResponsiveContainer } from 'recharts'
import type { SimulationCurvePoint } from '../api/portfolio'
import { formatEur, formatMoneyCompact, formatNumber, formatPrice } from '../utils/format'
import { zeroSplit } from '../utils/zeroSplit'
import { curvaEn, pasoTeclado } from '../utils/curvaSimulador'
import { useChartColors } from '../hooks/useChartColors'
import { useReducedMotion } from '../hooks/useReducedMotion'

// Curva del simulador de venta (#280, #529): resultado tras comisión e IRPF
// según el precio de venta, con rayas del precio actual y del break-even. El
// punto del precio elegido se arrastra a lo largo de la curva y, con el foco,
// se mueve con las flechas (1 % del precio actual; con Mayús, 10 %); Inicio
// vuelve al precio actual. Es un control deslizante para el lector de
// pantalla, con el precio y el resultado como texto.

// Área de trazado: eje Y de 64 px a la izquierda y 8 px a la derecha.
const INSET = { left: 64, right: 8 }

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
  const ref = useRef<HTMLDivElement>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const split = useMemo(() => zeroSplit(points.map(p => p.resultadoNeto)), [points])
  if (points.length < 2) return null

  const min = points[0].price
  const max = points[points.length - 1].price
  const elegido = Math.min(max, Math.max(min, chosen))
  const enPunto = curvaEn(points, elegido)
  const fijar = (p: number) => onPick(+Math.min(max, Math.max(min, p)).toPrecision(8))

  const precioEn = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return null
    const ancho = rect.width - INSET.left - INSET.right
    const frac = Math.min(1, Math.max(0, (clientX - rect.left - INSET.left) / Math.max(1, ancho)))
    return min + frac * (max - min)
  }
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const p = precioEn(e.clientX)
    if (p === null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setArrastrando(true)
    fijar(p)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!arrastrando) return
    const p = precioEn(e.clientX)
    if (p !== null) fijar(p)
  }
  const soltar = (e: React.PointerEvent<HTMLDivElement>) => {
    setArrastrando(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const siguiente = pasoTeclado(e.key, e.shiftKey, elegido, current > 0 ? current : (min + max) / 2)
    if (siguiente === null) return
    e.preventDefault()
    fijar(siguiente)
  }

  const valuetext = enPunto
    ? `Precio de venta ${formatPrice(elegido)}: resultado neto ${enPunto.resultadoNeto >= 0 ? '+' : ''}${formatEur(enPunto.resultadoNeto)}, neto en mano ${formatEur(enPunto.netoEnMano)}`
    : `Precio de venta ${formatPrice(elegido)}`

  return (
    <div ref={ref} role="slider" tabIndex={0} aria-label="Precio de venta en la curva del resultado"
      aria-valuemin={min} aria-valuemax={max} aria-valuenow={elegido} aria-valuetext={valuetext} aria-keyshortcuts="ArrowLeft ArrowRight Home"
      data-testid="curva-simulador"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={soltar} onPointerCancel={soltar} onKeyDown={onKeyDown}
      className={`h-52 rounded-lg select-none touch-none outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${arrastrando ? 'cursor-grabbing' : 'cursor-pointer'}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 14, right: INSET.right, left: 0, bottom: 0 }}>
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
          <XAxis dataKey="price" type="number" domain={[min, max]}
            tickFormatter={(v: number) => `${formatNumber(v, v < 1 ? 3 : 2)} €`}
            tick={{ fontSize: 11, fill: c.axis }} axisLine={false} tickLine={false} tickCount={5} />
          <YAxis tickFormatter={(v: number) => formatMoneyCompact(v, 'EUR')} tick={{ fontSize: 11, fill: c.axis }} axisLine={false} tickLine={false} width={INSET.left} />
          <ReferenceLine y={0} stroke={c.axis} strokeWidth={1.25} />
          {current > 0 && <ReferenceLine x={current} stroke={c.axis} strokeDasharray="4 4" label={{ value: 'Actual', position: 'top', fill: c.axis, fontSize: 10 }} />}
          {breakEven !== null && <ReferenceLine x={breakEven} stroke={c.axis} strokeDasharray="2 3" label={{ value: 'Break-even', position: 'insideTopLeft', fill: c.axis, fontSize: 10 }} />}
          <ReferenceLine x={elegido} stroke="var(--cf-brand)" strokeWidth={1.5} />
          {!arrastrando && <Tooltip content={<CurveTooltip />} cursor={{ stroke: c.cursorLine, strokeDasharray: '4 4' }} isAnimationActive={false} />}
          <Area type="monotone" dataKey="resultadoNeto" baseValue={0}
            stroke={split.stroke === null ? (split.solid === 'up' ? c.up : c.down) : `url(#${id}-stroke)`} strokeWidth={2}
            fill={`url(#${id}-fill)`} dot={false} activeDot={false}
            isAnimationActive={!reduceMotion} animationDuration={500} />
          {enPunto && (
            <ReferenceDot x={elegido} y={enPunto.resultadoNeto} ifOverflow="visible"
              shape={(p: { cx?: number; cy?: number }) => p.cx === undefined || p.cy === undefined ? <g /> : (
                <g data-testid="punto-curva">
                  <circle cx={p.cx} cy={p.cy} r={9} fill="var(--cf-brand)" opacity={0.2} />
                  <circle cx={p.cx} cy={p.cy} r={5.5} fill="var(--cf-brand)" stroke="var(--cf-bg-card)" strokeWidth={2} />
                </g>
              )} />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
