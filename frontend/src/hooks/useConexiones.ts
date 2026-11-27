import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { conexionesApi, type PlanCoinGecko, type ServicioId } from '../api/conexiones'

// Claves de API (versión 1.0): estado y cambios. Cada cambio refresca el
// estado; la de una red, además, las wallets (sus avisos de clave).
export function useConexiones() {
  const qc = useQueryClient()
  // consulta de fondo (#498): el fallo lo muestra Ajustes › Conexiones con QueryError; los atajos de las wallets se omiten.
  const q = useQuery({ queryKey: ['conexiones'], queryFn: conexionesApi.listar })
  const refrescar = () => Promise.all([qc.invalidateQueries({ queryKey: ['conexiones'] }), qc.invalidateQueries({ queryKey: ['wallets'] })])
  const guardar = useMutation({
    mutationFn: ({ id, clave, plan }: { id: ServicioId; clave: string; plan?: PlanCoinGecko }) => conexionesApi.guardar(id, clave, plan),
    onSuccess: refrescar,
  })
  const quitar = useMutation({ mutationFn: (id: ServicioId) => conexionesApi.quitar(id), onSuccess: refrescar })
  const probar = useMutation({ mutationFn: (id: ServicioId) => conexionesApi.probar(id) })
  return { q, guardar, quitar, probar }
}
