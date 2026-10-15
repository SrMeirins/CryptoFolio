import type { QueryClient } from '@tanstack/react-query'

// Las queries que cualquier cambio en transacciones (crear/editar/borrar
// una manual, importar un CSV) puede dejar desactualizadas. Antes cada
// página invalidaba su propio subconjunto copiado a mano, con huecos reales:
// History.tsx no invalidaba 'fiscal-summary' (el Dashboard y la página
// Fiscal podían quedarse con datos obsoletos tras borrar una tx desde
// Historial) e Import.tsx no invalidaba 'tx-stats' (la barra de
// estadísticas de Historial podía quedarse obsoleta hasta 5 min tras
// importar, su staleTime).
// Las consultas por moneda (#177) se cachean 5 min: también se invalidan aquí
// (el prefijo cubre las dos monedas).
const TRANSACTION_AFFECTED_KEYS = [
  'transactions', 'tx-stats', 'fifo-lots', 'fiscal-summary', 'eur-flow', 'daily-pnl', 'intraday-pnl',
] as const

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
