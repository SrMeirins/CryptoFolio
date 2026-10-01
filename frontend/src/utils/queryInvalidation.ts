import type { QueryClient } from '@tanstack/react-query'

// Las 4 queries que cualquier cambio en transacciones (crear/editar/borrar
// una manual, importar un CSV) puede dejar desactualizadas. Antes cada
// página invalidaba su propio subconjunto copiado a mano, con huecos reales:
// History.tsx no invalidaba 'fiscal-summary' (el Dashboard y la página
// Fiscal podían quedarse con datos obsoletos tras borrar una tx desde
// Historial) e Import.tsx no invalidaba 'tx-stats' (la barra de
// estadísticas de Historial podía quedarse obsoleta hasta 5 min tras
// importar, su staleTime).
const TRANSACTION_AFFECTED_KEYS = ['transactions', 'tx-stats', 'fifo-lots', 'fiscal-summary'] as const

/**
 * Invalida las queries afectadas por un cambio en transacciones.
 * `includeImports`: además invalida la lista de importaciones — solo
 * aplica al flujo de importar un CSV, no a crear/editar/borrar una tx manual.
 */
export function invalidateTransactionQueries(queryClient: QueryClient, { includeImports = false } = {}) {
  for (const key of TRANSACTION_AFFECTED_KEYS) {
    queryClient.invalidateQueries({ queryKey: [key] })
  }
  if (includeImports) {
    queryClient.invalidateQueries({ queryKey: ['imports'] })
  }
}
