// Colocación de un desplegable junto a su botón (#240): debajo si cabe; si no,
// encima cuando hay más sitio; alineado al borde izquierdo o derecho del botón
// y siempre dentro de la ventana. Devuelve también la altura máxima disponible.

export interface Box { top: number; left: number; width: number; height: number }

export interface PopoverPosition {
  top: number
  left: number
  placement: 'down' | 'up'
  maxHeight: number
}

export function computePopoverPosition({ anchor, size, viewport, align = 'start', gap = 6, margin = 8 }: {
  anchor: Box
  size: { width: number; height: number }
  viewport: { width: number; height: number }
  align?: 'start' | 'end'
  gap?: number
  margin?: number
}): PopoverPosition {
  const below = viewport.height - (anchor.top + anchor.height) - gap - margin
  const above = anchor.top - gap - margin
  const placement = size.height <= below || below >= above ? 'down' : 'up'
  const maxHeight = Math.max(0, placement === 'down' ? below : above)
  const height = Math.min(size.height, maxHeight)
  const top = placement === 'down' ? anchor.top + anchor.height + gap : anchor.top - gap - height

  const preferred = align === 'end' ? anchor.left + anchor.width - size.width : anchor.left
  const left = Math.min(Math.max(preferred, margin), Math.max(margin, viewport.width - size.width - margin))
  return { top, left, placement, maxHeight }
}
