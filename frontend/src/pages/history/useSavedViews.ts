import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi, type SavedView } from '../../api/portfolio'
import { failure } from '../../utils/queryFailure'

// Vistas guardadas del Historial (#369): lista y operaciones, con la caché de
// react-query invalidada tras cada cambio.

const KEY = ['historial-vistas'] as const

export function useSavedViews() {
  const queryClient = useQueryClient()
  const viewsQ = useQuery({ queryKey: KEY, queryFn: portfolioApi.getSavedViews, staleTime: 60_000 })
  const { data, isLoading } = viewsQ
  const done = () => queryClient.invalidateQueries({ queryKey: KEY })

  const create = useMutation({
    mutationFn: (body: { nombre: string; predeterminada: boolean; filtros: Record<string, string>; sustituir?: boolean }) =>
      portfolioApi.createSavedView(body),
    onSuccess: done,
  })
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; nombre?: string; predeterminada?: boolean }) => portfolioApi.updateSavedView(id, body),
    onSuccess: done,
  })
  const remove = useMutation({ mutationFn: (id: string) => portfolioApi.deleteSavedView(id), onSuccess: done })

  return { views: (data?.vistas ?? []) as SavedView[], loaded: !isLoading, fallo: failure(viewsQ), create, update, remove }
}
