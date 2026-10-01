import { useQuery } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'

/**
 * Lista de wallets, cacheada/deduplicada por React Query bajo la queryKey
 * 'wallets'. Antes varias páginas hacían su propio `fetch('/api/wallets')`
 * con queryKeys distintas ('wallets', 'wallets-list'...) que no compartían
 * caché entre sí, cada una disparando su propia petición de red para los
 * mismos datos.
 *
 * `pages/settings/WalletsSection.tsx` usa la misma queryKey 'wallets' con
 * su propio fetch y un tipo local más completo (incluye `addresses`, que
 * `api.Wallet` no tiene) — comparte caché con este hook por coincidir la
 * key, aunque no se ha migrado a consumirlo directamente (fuera de alcance
 * de este cambio, anotado para su propio turno).
 */
export function useWalletsQuery() {
  const { data: wallets = [] } = useQuery({ queryKey: ['wallets'], queryFn: portfolioApi.getWallets })
  return wallets
}
