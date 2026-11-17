import type { ChartMarker } from '../../../utils/assetPriceChart'

// Banderas de compras y ventas (#528): una franja encima o debajo del área de
// la línea, sin taparla. Cada bandera está en la fecha de la operación y su
// forma distingue el tipo (no solo el color): compra abierta, banderín lleno;
// compra ya vendida, banderín hueco; venta o permuta, bandera cuadrada llena.
// Se dibuja con <Customized> de Recharts, que pasa la escala del eje X y el
// área de trazado.

export const FRANJA_BANDERAS = 22

interface CustomizedProps {
  xAxisMap?: Record<string, { scale: (v: number) => number }>
  offset?: { top: number; left: number; width: number; height: number }
}

export function MarcasBanderas({ markers, lado, colorCompra, colorVenta, resaltadoDia, etiqueta, ...rc }: CustomizedProps & {
  markers: readonly ChartMarker[]
  lado: 'arriba' | 'abajo'
  colorCompra: string
  colorVenta: string
  resaltadoDia: string | null
  etiqueta: (m: ChartMarker) => string
}) {
  const xAxis = rc.xAxisMap ? Object.values(rc.xAxisMap)[0] : undefined
  const off = rc.offset
  if (!xAxis || !off) return null
  // Base del mástil: pegada al área de trazado (arriba) o bajo las etiquetas del eje (abajo).
  const base = lado === 'arriba' ? off.top - 3 : off.top + off.height + 20 + FRANJA_BANDERAS - 3
  const alto = 14
  return (
    <g data-testid={`banderas-${lado}`}>
      <line x1={off.left} x2={off.left + off.width} y1={base + 0.5} y2={base + 0.5} stroke="currentColor" strokeOpacity={0.15} />
      {markers.map(m => {
        const x = xAxis.scale(m.t)
        if (!Number.isFinite(x) || x < off.left - 1 || x > off.left + off.width + 1) return null
        const color = m.kind === 'venta' ? colorVenta : colorCompra
        const top = base - alto
        const resaltada = m.kind === 'venta' && m.day === resaltadoDia
        const bandera = m.kind === 'venta'
          ? <rect x={x} y={top} width={8} height={6} rx={1} fill={color} />
          : <path d={`M ${x} ${top} L ${x + 9} ${top + 3.5} L ${x} ${top + 7} Z`}
              fill={m.kind === 'compra' ? color : 'var(--cf-bg-card)'} stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
        return (
          <g key={`${m.kind}-${m.t}`} data-marker={m.kind} data-day={m.day} data-resaltada={resaltada || undefined}>
            <title>{etiqueta(m)}</title>
            {resaltada && <rect x={x - 4} y={top - 3} width={16} height={alto + 4} rx={3} fill={color} opacity={0.18} />}
            <line x1={x} x2={x} y1={top} y2={base} stroke={color} strokeWidth={1.3} />
            {bandera}
          </g>
        )
      })}
    </g>
  )
}
