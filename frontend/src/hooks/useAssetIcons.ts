import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

/**
 * Logos disponibles en el backend (#201): { SÍMBOLO: versión }. Solo se piden
 * las imágenes que existen, así que los activos sin logo no generan errores
 * 404 en la consola. Mientras el backend aún no tiene ninguno (primera
 * descarga en curso), se vuelve a consultar cada minuto.
 */
export function useAssetIcons(): Record<string, number> {
  const { data } = useQuery({
    queryKey: ['asset-icons'],
    queryFn: () => api.get<Record<string, number>>('/assets/icons'),
    staleTime: 10 * 60_000,
    refetchInterval: (query) => (query.state.data && Object.keys(query.state.data).length > 0 ? false : 60_000),
  })
  return data ?? EMPTY
}

const EMPTY: Record<string, number> = {}
