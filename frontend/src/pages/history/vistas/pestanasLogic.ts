// Vistas guardadas como pestañas del Historial (#552). Funciones puras.

export const TODAS = 'todas'

/**
 * Pestaña seleccionada: la vista que coincide exactamente con los filtros; si
 * ninguna coincide, la vista de la que se partió (que queda «modificada»); si
 * se partió de «Todas» o esa vista ya no existe, «Todas».
 */
export function pestanaSeleccionada(ids: readonly string[], exacta: string | null, origen: string): string {
  if (exacta) return exacta
  return origen !== TODAS && ids.includes(origen) ? origen : TODAS
}

/** La pestaña de una vista está modificada si está seleccionada sin coincidir con sus filtros. */
export function vistaModificada(seleccionada: string, exacta: string | null): boolean {
  return seleccionada !== TODAS && seleccionada !== exacta
}
