import { useEffect, useRef, type RefObject } from 'react'

/**
 * Ejecuta `onOutside` al hacer click/mousedown fuera del elemento referenciado
 * por `ref`. Solo escucha mientras `enabled` es true (evita listeners activos
 * cuando el elemento que controla, p. ej. un dropdown, está cerrado).
 *
 * `onOutside` se guarda en un ref en vez de ir en las dependencias del efecto:
 * así el listener se (re)suscribe solo cuando cambia `enabled`, no en cada
 * render por una nueva identidad de función (igual que el patrón original que
 * sustituye en los 4 sitios donde estaba duplicado, que solo dependía de
 * `[open]`).
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onOutside: () => void,
  enabled = true,
) {
  const onOutsideRef = useRef(onOutside)
  onOutsideRef.current = onOutside

  useEffect(() => {
    if (!enabled) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutsideRef.current()
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [ref, enabled])
}
