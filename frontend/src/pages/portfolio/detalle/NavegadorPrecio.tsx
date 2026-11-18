import { useId, useRef } from 'react'
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts'
import { encajar, MIN_SPAN, type Ventana } from '../../../utils/chartZoom'
import type { ChartPoint } from '../../../utils/assetPriceChart'

// Navegador de los gráficos con zoom (#528, rehecho en #510): la historia
// completa en pequeño con la ventana visible encima. Arrastrar la ventana la
// desplaza; sus asas la estiran o encogen; pulsar fuera la centra ahí. Debajo,
// las fechas de la ventana. Es una ayuda para el ratón y el táctil: con
// teclado, el gráfico tiene sus propias teclas y botones.

type Modo = 'mover' | 'inicio' | 'fin'

function Asa({ lado, onPointerDown }: { lado: 'inicio' | 'fin'; onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <span onPointerDown={onPointerDown}
      className={`absolute inset-y-0 ${lado === 'inicio' ? '-left-2' : '-right-2'} w-4 cursor-ew-resize flex items-center justify-center group/asa`}>
      <span className="h-6 w-2.5 rounded-full bg-background-card border border-brand/70 shadow-sm flex flex-col items-center justify-center gap-0.5 transition-colors group-hover/asa:bg-brand/15">
        <span className="h-px w-1 bg-brand/80" />
        <span className="h-px w-1 bg-brand/80" />
      </span>
    </span>
  )
}

export function NavegadorPrecio({ points, extent, v, onChange, color, etiqueta }: {
  points: readonly ChartPoint[]
  extent: Ventana
  v: Ventana
  onChange: (v: Ventana) => void
  color: string
  /** Formato de las fechas de la ventana bajo el navegador; sin él no se muestran. */
  etiqueta?: (t: number) => string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId().replace(/:/g, '')
  const drag = useRef<{ modo: Modo; x: number; v: Ventana } | null>(null)
  const total = extent.to - extent.from || 1
  const left = Math.max(0, ((v.from - extent.from) / total) * 100)
  const width = Math.min(100 - left, ((v.to - v.from) / total) * 100)

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
    <div aria-hidden="true" data-testid="navegador-precio" className="space-y-1">
      <div ref={ref}
        className="relative h-11 rounded-lg border border-border bg-overlay/3 select-none touch-none cursor-pointer overflow-visible"
        onPointerDown={centrar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
        <div className="absolute inset-0 rounded-lg overflow-hidden">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points as ChartPoint[]} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`${id}-nav`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <YAxis hide domain={['dataMin', 'dataMax']} />
              <Area type="monotone" dataKey="price" stroke={color} strokeOpacity={0.7} strokeWidth={1.25} fill={`url(#${id}-nav)`}
                dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
          {/* Lo que queda fuera de la ventana, atenuado */}
          <span className="absolute inset-y-0 left-0 bg-background-card/75 pointer-events-none transition-[width] duration-75" style={{ width: `${left}%` }} />
          <span className="absolute inset-y-0 right-0 bg-background-card/75 pointer-events-none transition-[width] duration-75" style={{ width: `${Math.max(0, 100 - left - width)}%` }} />
        </div>
        <span className="absolute inset-y-0 rounded-md border-[1.5px] border-brand/70 bg-brand/8 cursor-grab active:cursor-grabbing shadow-[0_0_0_1px_var(--cf-bg-card)]"
          style={{ left: `${left}%`, width: `${width}%` }} onPointerDown={e => empezar('mover', e)}>
          <Asa lado="inicio" onPointerDown={e => empezar('inicio', e)} />
          <Asa lado="fin" onPointerDown={e => empezar('fin', e)} />
        </span>
      </div>
      {etiqueta && (
        <div className="relative h-4 text-[10px] mono tabular-nums text-fg-subtle">
          {width < 22
            // Ventana estrecha: una sola etiqueta centrada para que no se solapen.
            ? <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${Math.min(85, Math.max(15, left + width / 2))}%` }}>{etiqueta(v.from)} a {etiqueta(v.to)}</span>
            : <>
                <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${Math.min(92, Math.max(8, left))}%` }}>{etiqueta(v.from)}</span>
                <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${Math.min(92, Math.max(8, left + width))}%` }}>{etiqueta(v.to)}</span>
              </>}
        </div>
      )}
    </div>
  )
}
