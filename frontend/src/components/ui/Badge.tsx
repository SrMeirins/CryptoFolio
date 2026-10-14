import type { HTMLAttributes } from 'react'
import { badgeClasses, type BadgeTone, type BadgeSize } from './classes'

// Insignia o chip (#199): etiquetas de estado, tipos y avisos cortos.

// Clases completas (no interpoladas) para que Tailwind las genere.
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  size?: BadgeSize
}

export function Badge({ tone = 'neutral', size = 'sm', className = '', ...rest }: BadgeProps) {
  return <span className={badgeClasses(tone, size, className)} {...rest} />
}
