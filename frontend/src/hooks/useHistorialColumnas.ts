import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
import { useToast } from './useToast'
import {
  HISTORIAL_COLUMNAS_KEY, columnasHistorial, serializarColumnasHistorial, type ColumnaHistorial,
} from '../utils/historialColumnas'

/**
 * Columnas visibles de la tabla del Historial (#554), guardadas en app_config.
 * El cambio se aplica al instante en la caché y se revierte si el guardado falla.
 * consulta de fondo (#498): sin configuración se muestran todas y la página
 * ya informa del fallo de la configuración.
 */
export function useHistorialColumnas(): { columnas: ColumnaHistorial[]; cambiar: (v: ColumnaHistorial[]) => Promise<void> } {
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: portfolioApi.getConfig })
  const queryClient = useQueryClient()
  const toast = useToast()

  async function cambiar(v: ColumnaHistorial[]) {
    const previous = queryClient.getQueryData<Record<string, string>>(['config'])
    const value = serializarColumnasHistorial(v)
    queryClient.setQueryData<Record<string, string>>(['config'], old => ({ ...(old ?? {}), [HISTORIAL_COLUMNAS_KEY]: value }))
    try {
      await portfolioApi.setConfig(HISTORIAL_COLUMNAS_KEY, value)
    } catch (e) {
      queryClient.setQueryData(['config'], previous)
      toast.fail('No se pudieron guardar las columnas de la tabla', e)
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['config'] })
    }
  }

  return { columnas: columnasHistorial(config), cambiar }
}
