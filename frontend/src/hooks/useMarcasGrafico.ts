import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
import { useToast } from './useToast'
import { GRAFICO_MARCAS_KEY, marcasGrafico, type MarcasGrafico } from '../utils/graficoMarcas'

/**
 * Marcas del gráfico de precio del detalle (#528), guardadas en app_config.
 * El cambio se aplica al instante en la caché y se revierte si el guardado falla.
 * consulta de fondo (#498): sin configuración se usan las marcas por defecto
 * y la página ya informa del fallo de la configuración.
 */
export function useMarcasGrafico(): { marcas: MarcasGrafico; cambiar: (v: MarcasGrafico) => Promise<void> } {
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: portfolioApi.getConfig })
  const queryClient = useQueryClient()
  const toast = useToast()

  async function cambiar(v: MarcasGrafico) {
    const previous = queryClient.getQueryData<Record<string, string>>(['config'])
    queryClient.setQueryData<Record<string, string>>(['config'], old => ({ ...(old ?? {}), [GRAFICO_MARCAS_KEY]: v }))
    try {
      await portfolioApi.setConfig(GRAFICO_MARCAS_KEY, v)
    } catch (e) {
      queryClient.setQueryData(['config'], previous)
      toast.fail('No se pudo guardar cómo se marcan las operaciones', e)
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['config'] })
    }
  }

  return { marcas: marcasGrafico(config), cambiar }
}
