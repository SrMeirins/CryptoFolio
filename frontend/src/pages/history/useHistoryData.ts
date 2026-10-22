import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../../api/portfolio'
import { useToast } from '../../hooks/useToast'
import { invalidateTransactionQueries } from '../../utils/queryInvalidation'
import { PAGE_SIZE } from './useHistoryFilters'

// Datos del Historial (#351): página actual, precarga de la siguiente,
// facetas para los filtros, nombre de la importación filtrada y borrado.

// Siempre en USD: la respuesta trae los flujos en ambas monedas y el tipo de
// cada fila, así que el cambio EUR ↔ USD no necesita otra petición (#177).
// La moneda va en los parámetros (#366): USD salvo con rango de importe.
const pageQuery = (params: Record<string, string>) => ({
  queryKey: ['transactions', params],
  queryFn:  () => portfolioApi.getTransactions(params, params.currency === 'EUR' ? 'EUR' : 'USD'),
})

export function useHistoryData(queryParams: Record<string, string>, offset: number, importId: string) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  const { data, isLoading, isFetching } = useQuery({ ...pageQuery(queryParams), placeholderData: prev => prev })

  // Precarga de la página siguiente con los mismos filtros y orden (#349).
  useEffect(() => {
    if (!data || offset + PAGE_SIZE >= data.total) return
    void queryClient.prefetchQuery(pageQuery({ ...queryParams, offset: String(offset + PAGE_SIZE) }))
  }, [data, queryParams, offset, queryClient])

  /** Ids de otra página con los mismos filtros (Anterior/Siguiente del detalle, #373). */
  async function pageIds(pageOffset: number): Promise<string[]> {
    const page = await queryClient.fetchQuery(pageQuery({ ...queryParams, offset: String(pageOffset) }))
    return page.transactions.map(t => t.id)
  }

  // Cuentas presentes en los datos (#346).
  const { data: facets } = useQuery({ queryKey: ['transactions', 'facets'], queryFn: portfolioApi.getTransactionFacets, staleTime: 60_000 })
  // Archivos importados: opciones del filtro por archivo y nombre del chip (#366).
  const { data: imports = [] } = useQuery({ queryKey: ['imports'], queryFn: portfolioApi.getImports, staleTime: 60_000 })

  /** Borra una transacción manual; true si se borró. */
  async function deleteTx(id: string): Promise<boolean> {
    setDeletingId(id)
    try {
      const result = await portfolioApi.deleteManualTx(id)
      invalidateTransactionQueries(queryClient)
      if (result.fifoError) toast.warning('Transacción eliminada', `Eliminada, pero el recálculo FIFO falló: ${result.fifoError}`)
      else toast.success('Transacción eliminada', 'FIFO recalculado')
      return true
    } catch (e) {
      toast.error('Error al eliminar', (e as Error).message)
      return false
    } finally {
      setDeletingId(null)
    }
  }

  /** Devuelve una importada editada a sus valores importados (#378); true si se restauró. */
  async function restoreTx(id: string): Promise<boolean> {
    setRestoringId(id)
    try {
      const result = await portfolioApi.restoreTransaction(id)
      invalidateTransactionQueries(queryClient)
      if (result.fifoError) toast.warning('Valores importados restaurados', `Restaurada, pero el recálculo FIFO falló: ${result.fifoError}`)
      else toast.success('Valores importados restaurados', 'FIFO recalculado')
      return true
    } catch (e) {
      toast.error('Error al restaurar', (e as Error).message)
      return false
    } finally {
      setRestoringId(null)
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
    deletingId, deleteTx, restoringId, restoreTx, pageIds,
    refresh: () => invalidateTransactionQueries(queryClient),
  }
}
