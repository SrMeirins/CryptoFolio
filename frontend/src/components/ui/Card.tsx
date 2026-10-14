import type { HTMLAttributes } from 'react'
import { cardClasses, type CardPadding } from './classes'

// Contenedor base (#199): mismo fondo, borde y radio en toda la app.

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding
}

export function Card({ padding = 'md', className = '', ...rest }: CardProps) {
  return <div className={cardClasses(padding, className)} {...rest} />
}
