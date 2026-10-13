import { queryOptions } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
import type { Currency } from '../utils/format'

// Consultas cuyos importes dependen de la moneda de visualización (#177). La
// moneda va siempre en la segunda posición de la clave: así cada moneda tiene
// su propia caché y useCurrencyQuery puede distinguirlas.

// Tiempo que una respuesta se considera fresca: al volver a una moneda ya
// cargada se muestra al instante sin pedirla otra vez.
const CURRENCY_STALE_MS = 5 * 60_000

export const eurFlowQuery = (currency: Currency) => queryOptions({
  queryKey: ['eur-flow', currency],
  queryFn: () => portfolioApi.getEurFlow(currency),
  staleTime: CURRENCY_STALE_MS,
})

export const dailyPnlQuery = (currency: Currency, from?: string, to?: string) => queryOptions({
  queryKey: ['daily-pnl', currency, from ?? 'all', to ?? 'today'],
  queryFn: () => portfolioApi.getDailyPnl(from, to, currency),
  staleTime: CURRENCY_STALE_MS,
})

export const portfolioHistoryQuery = (currency: Currency, period: string) => queryOptions({
  queryKey: ['portfolio-history', currency, period],
  queryFn: () => portfolioApi.getPortfolioHistory(period, currency),
  staleTime: CURRENCY_STALE_MS,
})

export const txStatsQuery = (currency: Currency) => queryOptions({
  queryKey: ['tx-stats', currency],
  queryFn: () => portfolioApi.getTransactionStats(currency),
  staleTime: CURRENCY_STALE_MS,
})
