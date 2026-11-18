// Cruz del gráfico de evolución (#509), como en un exchange: al pasar el
// ratón, una línea vertical y otra horizontal sobre el punto, con el valor en
// una etiqueta sobre el eje Y y la fecha sobre el eje X. Se dibuja con
// <Customized> de Recharts, que pasa las escalas y el área de trazado.

interface Escala { scale: (v: number) => number }
interface CustomizedProps {
  xAxisMap?: Record<string, Escala>
  yAxisMap?: Record<string, Escala>
  offset?: { top: number; left: number; width: number; height: number }
}

export function CruzExchange({ x, y, textoY, textoX, colores, ...rc }: CustomizedProps & {
  /** Punto señalado (valores de los ejes); null sin ratón encima. */
  x: number | null
  y: number | null
  textoY: string
  textoX: string
  colores: { linea: string; fondo: string; texto: string }
}) {
  const xa = rc.xAxisMap ? Object.values(rc.xAxisMap)[0] : undefined
  const ya = rc.yAxisMap ? Object.values(rc.yAxisMap)[0] : undefined
  const o = rc.offset
  if (x === null || y === null || !xa || !ya || !o) return null
  const px = xa.scale(x)
  const py = ya.scale(y)
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null
  const anchoY = Math.max(44, textoY.length * 6.6 + 12)
  const anchoX = Math.max(60, textoX.length * 6.2 + 12)
  const xLabel = Math.min(Math.max(px - anchoX / 2, o.left), o.left + o.width - anchoX)
  return (
    <g pointerEvents="none" data-testid="cruz-evolucion" aria-hidden="true">
      <line x1={o.left} x2={o.left + o.width} y1={py} y2={py} stroke={colores.linea} strokeDasharray="3 3" />
      <line x1={px} x2={px} y1={o.top} y2={o.top + o.height} stroke={colores.linea} strokeDasharray="3 3" />
      <rect x={o.left - anchoY - 2} y={py - 9} width={anchoY} height={18} rx={4} fill={colores.fondo} />
      <text x={o.left - 8} y={py + 4} textAnchor="end" fontSize={11} fontWeight={600} fill={colores.texto} className="mono">{textoY}</text>
      <rect x={xLabel} y={o.top + o.height + 3} width={anchoX} height={18} rx={4} fill={colores.fondo} />
      <text x={xLabel + anchoX / 2} y={o.top + o.height + 16} textAnchor="middle" fontSize={11} fontWeight={600} fill={colores.texto}>{textoX}</text>
    </g>
  )
}

/**
 * Etiqueta del último valor en el borde derecho (#509), a la altura del
 * último punto y del color de la curva, como el precio actual de un exchange.
 */
export function EtiquetaUltimo({ x, y, texto, color, ...rc }: CustomizedProps & {
  x: number | null
  y: number | null
  texto: string
  color: string
}) {
  const ya = rc.yAxisMap ? Object.values(rc.yAxisMap)[0] : undefined
  const o = rc.offset
  if (x === null || y === null || !ya || !o) return null
  const py = ya.scale(y)
  if (!Number.isFinite(py)) return null
  const ancho = Math.max(48, texto.length * 6.6 + 12)
  const px = o.left + o.width + 4
  return (
    <g pointerEvents="none" data-testid="ultimo-valor" aria-hidden="true">
      <line x1={o.left} x2={o.left + o.width} y1={py} y2={py} stroke={color} strokeOpacity={0.35} strokeDasharray="2 4" />
      <rect x={px} y={py - 9} width={ancho} height={18} rx={4} fill={color} />
      <text x={px + ancho / 2} y={py + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--cf-bg-card)" className="mono">{texto}</text>
    </g>
  )
}
