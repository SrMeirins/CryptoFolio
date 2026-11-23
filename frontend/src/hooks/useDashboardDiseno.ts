import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
import { useToast } from './useToast'
import { DASHBOARD_DISENO_KEY, leerDiseno, serializarDiseno, type Diseno } from '../utils/dashboardDiseno'

// Diseño del Dashboard (#521) en app_config. Cada cambio se aplica al instante
// en la caché y se guarda; si falla, se revierte y se avisa. Con `deshacer`,
// el aviso de guardado ofrece volver al diseño anterior.

export function useDashboardDiseno() {
  // consulta de fondo (#498): sin configuración se usa el diseño por defecto; el Dashboard y Ajustes ya avisan del fallo de la configuración.
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: portfolioApi.getConfig })
  const qc = useQueryClient()
  const toast = useToast()
  const diseno = leerDiseno(config)

  async function guardar(nuevo: Diseno, aviso?: { mensaje: string; deshacer: boolean }) {
    // Una recarga en vuelo de la configuración no debe pisar el cambio.
    await qc.cancelQueries({ queryKey: ['config'] })
    const previa = qc.getQueryData<Record<string, string>>(['config'])
    const anterior = leerDiseno(previa)
    const value = serializarDiseno(nuevo)
    qc.setQueryData<Record<string, string>>(['config'], old => ({ ...(old ?? {}), [DASHBOARD_DISENO_KEY]: value }))
    try {
      await portfolioApi.setConfig(DASHBOARD_DISENO_KEY, value)
      if (aviso) {
        toast.addToast({
          type: 'success', title: 'Guardado', message: aviso.mensaje,
          ...(aviso.deshacer && { action: { label: 'Deshacer', onClick: () => void guardar(anterior) } }),
        })
      }
    } catch (e) {
      qc.setQueryData(['config'], previa)
      toast.fail('No se pudo guardar el diseño del Dashboard', e)
    } finally {
      await qc.invalidateQueries({ queryKey: ['config'] })
    }
  }

  return { diseno, guardar }
}
