import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
import { useToast } from './useToast'
import { DUST_THRESHOLD_KEY, dustThresholdEur } from '../utils/preferences'
import { formatEur } from '../utils/format'

/**
 * Umbral de saldos residuales (#530) editable desde Portfolio: guarda el mismo
 * ajuste que Ajustes (dust_threshold_eur) y ofrece Deshacer en el aviso. El
 * cambio se aplica al instante en la caché y se revierte si el guardado falla.
 * consulta de fondo (#498): sin configuración se usa el umbral por defecto y
 * la página ya informa del fallo de la configuración.
 */
export function useUmbralRestos(): { umbral: number; cambiar: (eur: number) => Promise<void> } {
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: portfolioApi.getConfig })
  const queryClient = useQueryClient()
  const toast = useToast()

  async function guardar(eur: number, anterior: number, deshacer: boolean) {
    const previous = queryClient.getQueryData<Record<string, string>>(['config'])
    queryClient.setQueryData<Record<string, string>>(['config'], old => ({ ...(old ?? {}), [DUST_THRESHOLD_KEY]: String(eur) }))
    try {
      await portfolioApi.setConfig(DUST_THRESHOLD_KEY, String(eur))
      toast.addToast({
        type: 'success',
        title: deshacer ? `Saldos residuales por debajo de ${formatEur(eur)}` : 'Umbral anterior restaurado',
        action: deshacer ? { label: 'Deshacer', onClick: () => void guardar(anterior, eur, false) } : undefined,
      })
    } catch (e) {
      queryClient.setQueryData(['config'], previous)
      toast.fail('No se pudo guardar el umbral', e)
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['config'] })
    }
  }

  const umbral = dustThresholdEur(config)
  return { umbral, cambiar: (eur: number) => (eur === umbral ? Promise.resolve() : guardar(eur, umbral, true)) }
}
