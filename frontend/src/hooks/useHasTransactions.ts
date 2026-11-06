import { useQuery } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'

/**
 * Si la aplicación tiene alguna operación (#496), para elegir el vacío de
 * primer uso. Comparte la consulta de las estadísticas de Ajustes. Mientras no
 * se sabe, `empty` es false: nunca se muestra el primer uso por error.
 */
export function useHasTransactions(): { ready: boolean; empty: boolean } {
  // consulta de fondo (#498): si falla, no se muestra el vacío de primer uso y cada página trata su propio fallo.
  const { data } = useQuery({ queryKey: ['settings-stats'], queryFn: portfolioApi.getStats })
  return { ready: data !== undefined, empty: data !== undefined && data.transactions === 0 }
}
