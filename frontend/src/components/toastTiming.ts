import type { ToastItem } from './toastContext'

// Duración de los avisos (#497), según la norma de avisos y confirmaciones:
// - error, o aviso con acción (p. ej. Deshacer): 6 s;
// - éxito o información sin acción: 4 s.
// Mientras el ratón o el foco estén encima, el aviso no se cierra.
export const TOAST_MS = { corto: 4000, largo: 6000 } as const

export function toastDuration(t: Pick<ToastItem, 'type' | 'action' | 'duration'>): number {
  return t.duration ?? (t.type === 'error' || t.action ? TOAST_MS.largo : TOAST_MS.corto)
}

/**
 * Temporizador de cierre que se pausa y se reanuda desde donde se quedó, no
 * desde el principio (para terminar de leer o alcanzar la acción).
 */
export function createToastTimer(ms: number, onExpire: () => void) {
  let remaining = ms
  let startedAt = Date.now()
  let timer: ReturnType<typeof setTimeout> | null = setTimeout(onExpire, ms)
  return {
    pause() {
      if (!timer) return
      clearTimeout(timer); timer = null
      remaining = Math.max(0, remaining - (Date.now() - startedAt))
    },
    resume() {
      if (timer) return
      startedAt = Date.now()
      timer = setTimeout(onExpire, remaining)
    },
    clear() { if (timer) clearTimeout(timer); timer = null },
  }
}
