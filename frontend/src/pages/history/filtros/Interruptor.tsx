import type { ReactNode } from 'react'
import { Hint } from '../../../components/ui'

// Botón de filtro que se activa y desactiva (Manuales, Editadas) del Historial
// (#414, #552): aria-pressed y el estado también con color de borde y fondo,
// nunca solo con color (el texto no cambia, el estado lo anuncia aria-pressed).

export function Interruptor({ pressed, onClick, icon, children, title, tone = 'brand' }: {
  pressed: boolean
  onClick: () => void
  icon: ReactNode
  children: ReactNode
  title?: string
  tone?: 'brand' | 'warning'
}) {
  const on = tone === 'warning' ? 'bg-warning/10 border-warning/40 text-warning-ink' : 'bg-brand/10 border-brand/40 text-brand-ink'
  const hover = tone === 'warning' ? 'hover:border-warning/30' : 'hover:border-brand/30'
  const button = (
    <button type="button" onClick={onClick} aria-pressed={pressed}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${
        pressed ? on : `bg-background-tertiary border-border text-fg-muted ${hover}`}`}>
      {icon} {children}
    </button>
  )
  return title ? <Hint label={title}>{button}</Hint> : button
}
