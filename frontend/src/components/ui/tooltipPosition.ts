// Posición de un tooltip para que nunca se salga de la ventana (#211).
// Función pura: el componente mide el disparador y el tooltip y aplica el resultado.

export interface Box { top: number; left: number; width: number; height: number }
export type Placement = 'down' | 'up'

export interface TooltipPosition {
  top: number
  left: number
  placement: Placement
  /** Posición horizontal de la flecha dentro del tooltip (px), apuntando al centro del disparador. */
  arrowLeft: number
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

export function computeTooltipPosition({
  anchor, size, viewport, preferred = 'down', gap = 10, margin = 8, arrowInset = 14,
}: {
  anchor: Box
  size: { width: number; height: number }
  viewport: { width: number; height: number }
  preferred?: Placement
  gap?: number
  margin?: number
  arrowInset?: number
}): TooltipPosition {
  const spaceBelow = viewport.height - (anchor.top + anchor.height) - gap - margin
  const spaceAbove = anchor.top - gap - margin
  const fitsBelow = size.height <= spaceBelow
  const fitsAbove = size.height <= spaceAbove
  // Lado preferido si cabe; si no, el contrario si cabe; si no cabe en ninguno, el de más espacio.
  let placement: Placement = preferred
  if (preferred === 'down' && !fitsBelow && (fitsAbove || spaceAbove > spaceBelow)) placement = 'up'
  if (preferred === 'up' && !fitsAbove && (fitsBelow || spaceBelow > spaceAbove)) placement = 'down'

  const rawTop = placement === 'down' ? anchor.top + anchor.height + gap : anchor.top - gap - size.height
  const top = clamp(rawTop, margin, Math.max(margin, viewport.height - margin - size.height))

  const anchorCenter = anchor.left + anchor.width / 2
  const left = clamp(anchorCenter - size.width / 2, margin, Math.max(margin, viewport.width - margin - size.width))
  const arrowLeft = clamp(anchorCenter - left, arrowInset, Math.max(arrowInset, size.width - arrowInset))

  return { top, left, placement, arrowLeft }
}
