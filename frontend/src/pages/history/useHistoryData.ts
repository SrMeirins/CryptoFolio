import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../../api/portfolio'
import { useToast } from '../../hooks/useToast'
import { invalidateTransactionQueries } from '../../utils/queryInvalidation'
import { PAGE_SIZE } from './useHistoryFilters'

// Datos del Historial (#351): página actual, precarga de la siguiente,
// facetas para los filtros, nombre de la importación filtrada y borrado.

export function useHistoryData(queryParams: Record<string, string>, offset: number, importId: string) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['transactions', queryParams],
    // Siempre en USD: la respuesta trae los flujos en ambas monedas y el tipo
    // de cada fila, así que el cambio EUR ↔ USD no necesita otra petición (#177).
    // La moneda va en los parámetros (#366): USD salvo con rango de importe.
    queryFn:  () => portfolioApi.getTransactions(queryParams, queryParams.currency === 'EUR' ? 'EUR' : 'USD'),
    placeholderData: prev => prev,
  })

  // Precarga de la página siguiente con los mismos filtros y orden (#349).
  useEffect(() => {
    if (!data || offset + PAGE_SIZE >= data.total) return
    const next: Record<string, string> = { ...queryParams, offset: String(offset + PAGE_SIZE) }
    void queryClient.prefetchQuery({
      queryKey: ['transactions', next],
      queryFn:  () => portfolioApi.getTransactions(next, next.currency === 'EUR' ? 'EUR' : 'USD'),
    })
  }, [data, queryParams, offset, queryClient])

  // Cuentas presentes en los datos (#346).
  const { data: facets } = useQuery({ queryKey: ['transactions', 'facets'], queryFn: portfolioApi.getTransactionFacets, staleTime: 60_000 })
  // Archivos importados: opciones del filtro por archivo y nombre del chip (#366).
  const { data: imports = [] } = useQuery({ queryKey: ['imports'], queryFn: portfolioApi.getImports, staleTime: 60_000 })

  async function deleteTx(id: string) {
    setDeletingId(id)
    try {
      const result = await portfolioApi.deleteManualTx(id)
      invalidateTransactionQueries(queryClient)
      if (result.fifoError) toast.warning('Transacción eliminada', `Eliminada, pero el recálculo FIFO falló: ${result.fifoError}`)
      else toast.success('Transacción eliminada', 'FIFO recalculado')
    } catch (e) {
      toast.error('Error al eliminar', (e as Error).message)
    } finally {
      setDeletingId(null)
    }
  }

  // Memo propio: `data?.transactions ?? []` crearía un array nuevo en cada render.
  const transactions = useMemo(() => data?.transactions ?? [], [data])
  const total = data?.total ?? 0

  return {
    data, transactions, total, isLoading, isFetching,
    accounts: facets?.accounts ?? [],
    assets: facets?.assets ?? [],
    presentTypes: facets?.types ?? [],
    imports,
    importFilename: imports.find(i => i.id === importId)?.filename ?? null,
    deletingId, deleteTx,
    refresh: () => invalidateTransactionQueries(queryClient),
  }
}
