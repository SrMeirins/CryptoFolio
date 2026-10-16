import { useLayoutEffect, useRef, type RefObject } from 'react'

/**
 * Reordenación animada de filas (FLIP, #282). Solo anima cuando cambia
 * `orderKey` (orden, filtro o vista elegidos por el usuario); los cambios de
 * posición por precios en vivo se aplican sin movimiento. Las filas se
 * identifican por su atributo `data-row-key`.
 */
export function useFlipRows(containerRef: RefObject<HTMLElement | null>, orderKey: string, disabled: boolean): void {
  const positions = useRef(new Map<string, number>())
  const lastKey = useRef(orderKey)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-row-key]'))
    const animate = !disabled && lastKey.current !== orderKey
    lastKey.current = orderKey
    const next = new Map<string, number>()
    for (const el of rows) {
      const key = el.dataset.rowKey ?? ''
      const top = el.getBoundingClientRect().top
      next.set(key, top)
      const before = positions.current.get(key)
      if (!animate || before === undefined || before === top || typeof el.animate !== 'function') continue
      // Invert: se coloca donde estaba y se deja volver a su sitio (Play).
      el.animate([{ transform: `translateY(${before - top}px)` }, { transform: 'translateY(0)' }],
        { duration: 260, easing: 'cubic-bezier(0.2, 0, 0, 1)' })
    }
    positions.current = next
  })
}
