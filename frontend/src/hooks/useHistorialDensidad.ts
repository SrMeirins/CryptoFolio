import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
import { useToast } from './useToast'
import { HISTORIAL_DENSIDAD_KEY, densidadHistorial, type DensidadHistorial } from '../utils/historialDensidad'

/**
 * Densidad de la tabla del Historial (#552), guardada en app_config.
 * El cambio se aplica al instante en la caché y se revierte si el guardado falla.
 * consulta de fondo (#498): sin configuración se usa la cómoda y la página
 * ya informa del fallo de la configuración.
 */
export function useHistorialDensidad(): { densidad: DensidadHistorial; cambiar: (v: DensidadHistorial) => Promise<void> } {
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: portfolioApi.getConfig })
  const queryClient = useQueryClient()
  const toast = useToast()

  async function cambiar(v: DensidadHistorial) {
    const previous = queryClient.getQueryData<Record<string, string>>(['config'])
    queryClient.setQueryData<Record<string, string>>(['config'], old => ({ ...(old ?? {}), [HISTORIAL_DENSIDAD_KEY]: v }))
    try {
      await portfolioApi.setConfig(HISTORIAL_DENSIDAD_KEY, v)
    } catch (e) {
      queryClient.setQueryData(['config'], previous)
      toast.fail('No se pudo guardar la densidad de la tabla', e)
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['config'] })
    }
  }

  return { densidad: densidadHistorial(config), cambiar }
}
