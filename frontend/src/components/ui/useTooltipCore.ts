import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { computeTooltipPosition, type Placement, type TooltipPosition } from './tooltipPosition'

/**
 * Estado común de Tooltip y Hint (#495): abierto al pasar o enfocar, fijado al
 * tocar, posición medida antes de pintar y cierre con Escape, al tocar fuera,
 * al cambiar el tamaño de la ventana o al desplazarse.
 */
export function useTooltipCore(direction: Placement) {
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [position, setPosition] = useState<TooltipPosition | null>(null)
  const anchorRef = useRef<HTMLElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const tooltipId = useId()
  const open = hovered || pinned

  const place = useCallback(() => {
    const anchor = anchorRef.current?.getBoundingClientRect()
    const tip = tipRef.current?.getBoundingClientRect()
    if (!anchor || !tip) return
    setPosition(computeTooltipPosition({
      anchor: { top: anchor.top, left: anchor.left, width: anchor.width, height: anchor.height },
      size: { width: tip.width, height: tip.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      preferred: direction,
    }))
  }, [direction])

  // Se mide antes de pintar para no mostrar el tooltip en una posición errónea.
  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPinned(false); setHovered(false) } }
    const onPointer = (e: PointerEvent) => {
      if (!anchorRef.current?.contains(e.target as Node) && !tipRef.current?.contains(e.target as Node)) setPinned(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, place])

  return { open, pinned, setHovered, setPinned, position, anchorRef, tipRef, tooltipId }
}
