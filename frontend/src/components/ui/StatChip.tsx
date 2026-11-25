import type { ReactNode } from 'react'

// Chip de contexto de las tarjetas de métricas (#507, #553): un dato clave bajo
// la cifra (recuento, Hoy, 24 h…). Común a las KPI del Dashboard y al resumen
// del Historial. El tono acompaña al texto, nunca va solo.

const TONOS = {
  positive: 'bg-positive/8 border-positive/25 text-positive-ink',
  negative: 'bg-negative/8 border-negative/25 text-negative-ink',
  neutral: 'border-border text-fg-muted',
  muted: 'border-border/60 text-fg-subtle',
} as const

export type StatChipTone = keyof typeof TONOS

export function StatChip({ children, tone = 'neutral', color }: {
  children: ReactNode
  tone?: StatChipTone
  /** Color propio (variable del tema) en borde y fondo, con el texto en el color normal (contraste). */
  color?: string
}) {
  const propio = color ? { borderColor: `color-mix(in srgb, ${color} 55%, transparent)`, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` } : undefined
  return (
    <span style={propio}
      className={`inline-flex items-center px-1.5 py-0.5 rounded-lg border text-xs leading-none whitespace-nowrap mono font-semibold ${color ? 'text-fg' : TONOS[tone]}`}>
      {children}
    </span>
  )
}
