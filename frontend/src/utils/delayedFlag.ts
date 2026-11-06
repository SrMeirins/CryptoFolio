// Retraso de los indicadores de carga (#494): un esqueleto o una barra solo
// aparecen si la carga dura más de LOADING_DELAY_MS, para no parpadear en las
// cargas rápidas. Lógica de temporizador sin React, para probarla aparte.

export const LOADING_DELAY_MS = 300

/**
 * Mientras `active` sea true, llama a `set(true)` pasado `delayMs`; si no lo
 * es, llama a `set(false)` en el acto. Devuelve la cancelación del temporizador.
 */
export function scheduleDelayedFlag(active: boolean, delayMs: number, set: (v: boolean) => void): () => void {
  if (!active) {
    set(false)
    return () => {}
  }
  const timer = setTimeout(() => set(true), delayMs)
  return () => clearTimeout(timer)
}
