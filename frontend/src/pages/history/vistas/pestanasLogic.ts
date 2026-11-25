// Vistas guardadas como pestañas del Historial (#552). Funciones puras.

export const TODAS = 'todas'

/**
 * Pestaña seleccionada:
 * - «Todas» si se eligió y no hay filtros, aunque alguna vista guarde lo mismo
 *   (una vista con solo el orden no debe bloquearla);
 * - la vista de la que se partió, si sigue existiendo: coincide o queda
 *   «modificada» (no se salta a otra vista que casualmente coincida);
 * - desde «Todas» con filtros, la primera vista que coincida; si ninguna,
 *   «Todas».
 */
export function pestanaSeleccionada(ids: readonly string[], coincidentes: readonly string[], origen: string, hayFiltros: boolean): string {
  if (origen === TODAS && !hayFiltros) return TODAS
  if (origen !== TODAS && ids.includes(origen)) return origen
  return coincidentes[0] ?? TODAS
}

/** La pestaña de una vista está modificada si está seleccionada sin coincidir con sus filtros. */
export function vistaModificada(seleccionada: string, coincidentes: readonly string[]): boolean {
  return seleccionada !== TODAS && !coincidentes.includes(seleccionada)
}
