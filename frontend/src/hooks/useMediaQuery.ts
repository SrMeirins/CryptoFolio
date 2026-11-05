import { useSyncExternalStore } from 'react'

// Estado de una media query (#499), sincronizado con el navegador sin efectos.
// Sin matchMedia (tests, SSR) devuelve false: la vista de escritorio.

/** Por debajo de 768 px: menú en cajón y barra superior reducida. */
export const NARROW_QUERY = '(max-width: 767px)'
/** Por debajo de 1024 px: menú lateral plegado a iconos. */
export const MEDIUM_QUERY = '(max-width: 1023px)'

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    onChange => {
      const mql = window.matchMedia?.(query)
      mql?.addEventListener('change', onChange)
      return () => mql?.removeEventListener('change', onChange)
    },
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  )
}
