import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
import { useToast } from './useToast'
import { DASHBOARD_DISENO_KEY, leerDiseno, serializarDiseno, type Diseno } from '../utils/dashboardDiseno'

// Diseño del Dashboard (#521) en app_config. Cada cambio se aplica al instante
// en la caché y se guarda; si falla, se vuelve a lo guardado y se avisa. Con
// `aviso.deshacer`, el aviso ofrece volver al diseño anterior.
// Los guardados van en cola, uno tras otro: dos movimientos seguidos podían
// llegar al servidor en orden inverso y quedarse el primero. Al vaciarse la
// cola se vuelve a fijar el último valor en la caché (una recarga de la
// configuración que arrancó a mitad de la cola traería uno intermedio); solo
// si algún guardado falla se recarga lo que tiene el servidor.

let cola: Promise<void> = Promise.resolve()
let enCola = 0
let ultimo: string | null = null
let fallo = false

export function useDashboardDiseno() {
  // consulta de fondo (#498): sin configuración se usa el diseño por defecto; el Dashboard y Ajustes ya avisan del fallo de la configuración.
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: portfolioApi.getConfig })
  const qc = useQueryClient()
  const toast = useToast()
  const diseno = leerDiseno(config)

  function guardar(nuevo: Diseno, aviso?: { mensaje: string; deshacer: boolean }): Promise<void> {
    const anterior = leerDiseno(qc.getQueryData<Record<string, string>>(['config']))
    const value = serializarDiseno(nuevo)
    // Una recarga en vuelo no debe pisar el cambio; sin revertir su estado.
    void qc.cancelQueries({ queryKey: ['config'] }, { revert: false })
    qc.setQueryData<Record<string, string>>(['config'], old => ({ ...(old ?? {}), [DASHBOARD_DISENO_KEY]: value }))
    enCola++
    ultimo = value
    const paso = cola.then(async () => {
      try {
        await portfolioApi.setConfig(DASHBOARD_DISENO_KEY, value)
        if (aviso) {
          toast.addToast({
            type: 'success', title: 'Guardado', message: aviso.mensaje,
            ...(aviso.deshacer && { action: { label: 'Deshacer', onClick: () => void guardar(anterior) } }),
          })
        }
      } catch (e) {
        fallo = true
        toast.fail('No se pudo guardar el diseño del Dashboard', e)
      } finally {
        enCola--
        if (enCola === 0) {
          if (fallo) {
            fallo = false
            await qc.invalidateQueries({ queryKey: ['config'] })
          } else if (ultimo !== null) {
            const final = ultimo
            void qc.cancelQueries({ queryKey: ['config'] }, { revert: false })
            qc.setQueryData<Record<string, string>>(['config'], old => ({ ...(old ?? {}), [DASHBOARD_DISENO_KEY]: final }))
          }
        }
      }
    })
    cola = paso
    return paso
  }

  return { diseno, guardar }
}
