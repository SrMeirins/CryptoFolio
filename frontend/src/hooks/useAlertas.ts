import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { alertasApi, type CambiosAlerta, type NuevaAlerta } from '../api/alertas'

// Alertas (#519): lista y cambios. Cada cambio refresca la lista y la campana
// (una alerta borrada deja de avisar).

export function useAlertas() {
  const qc = useQueryClient()
  // consulta de fondo (#498): el fallo lo muestran quienes listan las alertas (Ajustes y el detalle del activo); las líneas del gráfico se omiten.
  const q = useQuery({ queryKey: ['alertas'], queryFn: alertasApi.listar, refetchInterval: 60_000 })
  const refrescar = () => Promise.all([qc.invalidateQueries({ queryKey: ['alertas'] }), qc.invalidateQueries({ queryKey: ['notifications'] })])
  const crear = useMutation({ mutationFn: (a: NuevaAlerta) => alertasApi.crear(a), onSuccess: refrescar })
  const editar = useMutation({ mutationFn: ({ id, cambios }: { id: string; cambios: CambiosAlerta }) => alertasApi.editar(id, cambios), onSuccess: refrescar })
  const borrar = useMutation({ mutationFn: (id: string) => alertasApi.borrar(id), onSuccess: refrescar })
  return { q, alertas: q.data?.alertas ?? [], crear, editar, borrar }
}
