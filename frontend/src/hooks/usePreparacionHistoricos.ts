import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi, type PreparacionHistoricos } from '../api/portfolio'

const SONDEO_MS = 3_000

/**
 * ¿Están todos los precios de cierre históricos? (#334). Mientras no, el
 * dashboard no muestra cifras derivadas del histórico (P&L de hoy, gráfico,
 * calendario, mejor/peor día). Sondea solo mientras falta algo y, al
 * completarse, refresca las consultas del P&L para que aparezcan las cifras reales.
 */
export function usePreparacionHistoricos(): { listo: boolean; cargando: boolean; datos: PreparacionHistoricos | undefined } {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['pnl-preparacion'],
    queryFn: portfolioApi.getPreparacionHistoricos,
    refetchInterval: q => (q.state.data?.completo ? false : SONDEO_MS),
  })
  const antes = useRef<boolean | undefined>(undefined)
  useEffect(() => {
    if (antes.current === false && data?.completo) {
      void queryClient.invalidateQueries({ queryKey: ['daily-pnl'] })
      void queryClient.invalidateQueries({ queryKey: ['pnl-day'] })
    }
    antes.current = data?.completo
  }, [data?.completo, queryClient])
  return { listo: data?.completo === true, cargando: isLoading, datos: data }
}
