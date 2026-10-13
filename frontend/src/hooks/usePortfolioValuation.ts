import { useMemo } from 'react'
import type { FifoLot, FiatBalance } from '../api/portfolio'
import { valuePortfolio, type PortfolioValuation } from '../utils/portfolioValuation'
import { useDisplayLots, useDisplayMarket } from './useDisplayMarket'

/**
 * Valoración del portfolio con los precios en vivo, en la moneda de
 * visualización (#177); se recalcula con cada actualización de precio.
 */
export function usePortfolioValuation(lots: FifoLot[], fiatBalances: FiatBalance[]): PortfolioValuation {
  const market = useDisplayMarket()
  const displayLots = useDisplayLots(lots, market)
  const { prices, rate } = market
  return useMemo(
    () => valuePortfolio(displayLots, prices, fiatBalances, rate ?? 0),
    [displayLots, prices, fiatBalances, rate],
  )
}
