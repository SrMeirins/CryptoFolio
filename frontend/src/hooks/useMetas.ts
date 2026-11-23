import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
import { guardarEnLista, leerMetas, METAS_KEY, quitarDeLista, type Meta } from '../utils/metas'

// Metas de inversión (#520), guardadas en app_config bajo «metas». Cada cambio
// se aplica al instante en la caché y se revierte si el guardado falla; el
// error queda en `guardar.error` para que lo diga quien lo pidió.

export function useMetas() {
  const qc = useQueryClient()
  // consulta de fondo (#498): sin configuración no hay metas que mostrar; el Dashboard y Ajustes ya informan del fallo de la configuración.
  const configQ = useQuery({ queryKey: ['config'], queryFn: portfolioApi.getConfig })
  const metas = leerMetas(configQ.data)

  const guardar = useMutation({
    mutationFn: (lista: readonly Meta[]) => portfolioApi.setConfig(METAS_KEY, JSON.stringify(lista)),
    onMutate: async (lista: readonly Meta[]) => {
      await qc.cancelQueries({ queryKey: ['config'] })
      const previa = qc.getQueryData<Record<string, string>>(['config'])
      qc.setQueryData<Record<string, string>>(['config'], old => ({ ...(old ?? {}), [METAS_KEY]: JSON.stringify(lista) }))
      return { previa }
    },
    onError: (_e, _lista, ctx) => { if (ctx) qc.setQueryData(['config'], ctx.previa) },
    onSettled: () => qc.invalidateQueries({ queryKey: ['config'] }),
  })

  return {
    metas,
    cargando: configQ.isLoading,
    guardar,
    /** Crea la meta o sustituye la del mismo id. */
    guardarMeta: (meta: Meta, opciones?: { onSuccess?: () => void }) => guardar.mutate(guardarEnLista(metas, meta), opciones),
    borrarMeta: (id: string) => guardar.mutate(quitarDeLista(metas, id)),
  }
}
