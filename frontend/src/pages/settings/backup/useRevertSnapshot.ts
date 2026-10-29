import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { backupApi } from '../../../api/backup'
import { useToast } from '../../../hooks/useToast'

// Volver al estado guardado antes de una restauración (#453). Lo usan el
// aviso «Deshacer» tras restaurar y el bloque «Estado anterior».
export function useRevertSnapshot() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [reverting, setReverting] = useState(false)

  async function revert(id: string) {
    setReverting(true)
    try {
      await backupApi.revert(id)
      // Cambian todos los datos: se refresca todo, también la lista de estados previos.
      await queryClient.invalidateQueries({ refetchType: 'all' })
      toast.success('Datos como antes de restaurar')
    } catch (err) {
      toast.error('No se pudo volver atrás', (err as Error).message)
    } finally {
      setReverting(false)
    }
  }

  return { reverting, revert }
}
