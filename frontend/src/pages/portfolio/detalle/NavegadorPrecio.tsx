import { useRef } from 'react'
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts'
import { encajar, MIN_SPAN, type Ventana } from '../../../utils/chartZoom'
import type { ChartPoint } from '../../../utils/assetPriceChart'

// Navegador del gráfico de precio (#528): la historia completa en pequeño con
// la ventana visible encima. Arrastrar la ventana la desplaza; sus bordes la
// estiran o encogen; pulsar fuera la centra ahí. Es una ayuda para el ratón:
// con teclado, el gráfico tiene sus propias teclas y botones.

type Modo = 'mover' | 'inicio' | 'fin'

export function NavegadorPrecio({ points, extent, v, onChange, color }: {
  points: readonly ChartPoint[]
  extent: Ventana
  v: Ventana
  onChange: (v: Ventana) => void
  color: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ modo: Modo; x: number; v: Ventana } | null>(null)
  const total = extent.to - extent.from || 1
  const left = ((v.from - extent.from) / total) * 100
  const width = ((v.to - v.from) / total) * 100

  const msPorPx = () => total / Math.max(1, ref.current?.getBoundingClientRect().width ?? 1)
  const empezar = (modo: Modo, e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    drag.current = { modo, x: e.clientX, v }
    ref.current?.setPointerCapture(e.pointerId)
  }
  const mover = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const delta = (e.clientX - d.x) * msPorPx()
    if (d.modo === 'mover') onChange(encajar({ from: d.v.from + delta, to: d.v.to + delta }, extent))
    else if (d.modo === 'inicio') onChange(encajar({ from: Math.min(d.v.from + delta, d.v.to - MIN_SPAN), to: d.v.to }, extent))
    else onChange(encajar({ from: d.v.from, to: Math.max(d.v.to + delta, d.v.from + MIN_SPAN) }, extent))
  }
  const soltar = (e: React.PointerEvent) => {
    drag.current = null
    if (ref.current?.hasPointerCapture(e.pointerId)) ref.current.releasePointerCapture(e.pointerId)
  }
  // Pulsar fuera de la ventana la centra en ese punto.
  const centrar = (e: React.PointerEvent) => {
    if (e.button !== 0 || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const t = extent.from + ((e.clientX - rect.left) / rect.width) * total
    const w = v.to - v.from
    onChange(encajar({ from: t - w / 2, to: t + w / 2 }, extent))
  }

  return (
    <div ref={ref} aria-hidden="true" data-testid="navegador-precio"
      className="relative h-9 rounded-md border border-border bg-overlay/2 select-none touch-none cursor-pointer"
      onPointerDown={centrar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points as ChartPoint[]} margin={{ top: 3, right: 0, left: 0, bottom: 3 }}>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Area type="monotone" dataKey="price" stroke={color} strokeOpacity={0.6} strokeWidth={1} fill={color} fillOpacity={0.12}
            dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
      {/* Lo que queda fuera de la ventana, atenuado */}
      <span className="absolute inset-y-0 left-0 bg-background-card/60 rounded-l-md pointer-events-none" style={{ width: `${left}%` }} />
      <span className="absolute inset-y-0 right-0 bg-background-card/60 rounded-r-md pointer-events-none" style={{ width: `${Math.max(0, 100 - left - width)}%` }} />
      <span className="absolute inset-y-0 border-y-2 border-brand/70 bg-brand/5 cursor-grab active:cursor-grabbing"
        style={{ left: `${left}%`, width: `${width}%` }} onPointerDown={e => empezar('mover', e)}>
        <span className="absolute inset-y-0 -left-1 w-2 cursor-ew-resize flex items-center justify-center" onPointerDown={e => empezar('inicio', e)}>
          <span className="h-4 w-1 rounded-full bg-brand" />
        </span>
        <span className="absolute inset-y-0 -right-1 w-2 cursor-ew-resize flex items-center justify-center" onPointerDown={e => empezar('fin', e)}>
          <span className="h-4 w-1 rounded-full bg-brand" />
        </span>
      </span>
    </div>
  )
}
