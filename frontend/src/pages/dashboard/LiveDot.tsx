// Punto final de la curva con precios en vivo (#214): un punto fijo y un halo
// que late. Con «reducir movimiento» el halo no se anima (index.css).
export function LiveDot({ cx, cy, color }: { cx?: number; cy?: number; color: string }) {
  if (cx === undefined || cy === undefined) return null
  return (
    <g aria-hidden="true">
      <circle cx={cx} cy={cy} r={4} fill={color} className="chart-live-pulse" />
      <circle cx={cx} cy={cy} r={4} fill={color} />
    </g>
  )
}
