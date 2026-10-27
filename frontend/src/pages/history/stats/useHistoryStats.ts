import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../../../api/portfolio'
import { statsParams } from './statsChart'

// Estadísticas del Historial sobre lo filtrado (#376), en paralelo con la
// lista; conservan las cifras previas mientras recalculan y traen ambas
// monedas. El margen (#403) solo cambia el resumen y la analítica: la otra
// variante se precarga para que el interruptor responda al instante.

const statsKey = (params: Record<string, string>) => ['transactions', 'estadisticas', params] as const

export function useHistoryStats(listParams: Record<string, string>, includeMargin: boolean) {
  const queryClient = useQueryClient()
  const params = useMemo(() => ({ ...statsParams(listParams), incluir_margen: String(includeMargin) }), [listParams, includeMargin])
  const query = useQuery({
    queryKey: statsKey(params),
    queryFn: () => portfolioApi.getHistoryStats(params),
    placeholderData: prev => prev,
  })

  const loaded = query.isSuccess && !query.isPlaceholderData
  useEffect(() => {
    if (!loaded) return
    const other = { ...params, incluir_margen: String(!includeMargin) }
    void queryClient.prefetchQuery({ queryKey: statsKey(other), queryFn: () => portfolioApi.getHistoryStats(other) })
  }, [loaded, params, includeMargin, queryClient])

  return query.data
}
