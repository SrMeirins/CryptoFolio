import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
import { useToast } from './useToast'
import { PORTFOLIO_COLUMNAS_KEY, portfolioColumnas, serializarColumnas, type ColumnKey } from '../utils/portfolioColumns'

/**
 * Columnas visibles de la tabla de posiciones (#527), guardadas en app_config.
 * El cambio se aplica al instante en la caché y se revierte si el guardado falla.
 * consulta de fondo (#498): sin configuración se usan las columnas por defecto
 * y la página ya informa del fallo de la configuración.
 */
export function usePortfolioColumnas(): { columnas: ColumnKey[]; cambiar: (cols: readonly ColumnKey[]) => Promise<void> } {
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: portfolioApi.getConfig })
  const queryClient = useQueryClient()
  const toast = useToast()

  async function cambiar(cols: readonly ColumnKey[]) {
    const value = serializarColumnas(cols)
    const previous = queryClient.getQueryData<Record<string, string>>(['config'])
    queryClient.setQueryData<Record<string, string>>(['config'], old => ({ ...(old ?? {}), [PORTFOLIO_COLUMNAS_KEY]: value }))
    try {
      await portfolioApi.setConfig(PORTFOLIO_COLUMNAS_KEY, value)
    } catch (e) {
      queryClient.setQueryData(['config'], previous)
      toast.fail('No se pudieron guardar las columnas', e)
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['config'] })
    }
  }

  return { columnas: portfolioColumnas(config), cambiar }
}
