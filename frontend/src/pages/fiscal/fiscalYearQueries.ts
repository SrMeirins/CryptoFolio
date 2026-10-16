import { portfolioApi } from '../../api/portfolio'
import { FISCAL_STALE_TIME } from './constants'

// Consultas de un ejercicio fiscal (#295). Las mismas claves sirven para la
// página y para la precarga en segundo plano: cambiar a un año precargado lee
// la caché y es instantáneo.
export function fiscalYearQueries(year: number) {
  return {
    summary:   { queryKey: ['fiscal-summary-detail', year] as const, queryFn: () => portfolioApi.getFiscalSummaryDetail(year), staleTime: FISCAL_STALE_TIME },
    events:    { queryKey: ['fiscal-events', year] as const,         queryFn: () => portfolioApi.getFiscalEvents(year),        staleTime: FISCAL_STALE_TIME },
    modelo721: { queryKey: ['fiscal-721', year] as const,            queryFn: () => portfolioApi.getFiscalModelo721(year),     staleTime: FISCAL_STALE_TIME },
    breakdown: { queryKey: ['fiscal-breakdown', year] as const,      queryFn: () => portfolioApi.getFiscalBreakdown(year),     staleTime: FISCAL_STALE_TIME },
    monthly:   { queryKey: ['fiscal-monthly', year] as const,        queryFn: () => portfolioApi.getFiscalMonthly(year),       staleTime: FISCAL_STALE_TIME },
  }
}

/** Años a precargar: todos menos el activo, empezando por los más próximos a él. */
export function prefetchOrder(years: readonly number[], active: number | null): number[] {
  return years
    .filter(y => y !== active)
    .sort((a, b) => (active === null ? b - a : Math.abs(a - active) - Math.abs(b - active) || b - a))
}
