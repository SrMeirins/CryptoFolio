import { useId } from 'react'
import { sparklineChange, sparklinePoints } from '../utils/sparkline'
import { formatPercent } from '../utils/format'

// Mini-gráfico de tendencia (#251): línea y área suave en un SVG que se
// estira al ancho del contenedor. El color sigue la tendencia del periodo.

const W = 100
const H = 28

export function Sparkline({ values, days, className = '' }: { values: readonly number[]; days: number; className?: string }) {
  const id = useId()
  const gradientId = `${id}-fill`
  const clipId = `${id}-clip`
  const points = sparklinePoints(values, W, H)
  if (!points) return null
  const change = sparklineChange(values) ?? 0
  const color = change >= 0 ? 'var(--cf-positive)' : 'var(--cf-negative)'
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className}
      role="img" aria-label={`Tendencia de ${days} días: ${formatPercent(change, 1, true)}`}>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        {/* Se descubre de izquierda a derecha al aparecer (#251). */}
        <clipPath id={clipId}><rect width={W} height={H} className="sparkline-reveal" /></clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <polygon points={`0,${H} ${points} ${W},${H}`} fill={`url(#${gradientId})`} />
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke"
          strokeLinejoin="round" strokeLinecap="round" />
      </g>
    </svg>
  )
}
