import { useMemo } from 'react'
import type { FifoLot, FiatBalance } from '../api/portfolio'
import { usePricesStore } from '../store/pricesStore'
import { valuePortfolio, type PortfolioValuation } from '../utils/portfolioValuation'

/** Valoración del portfolio con los precios en vivo; se recalcula con cada actualización de precio. */
export function usePortfolioValuation(lots: FifoLot[], fiatBalances: FiatBalance[]): PortfolioValuation {
  const prices = usePricesStore(s => s.prices)
  return useMemo(() => valuePortfolio(lots, prices, fiatBalances), [lots, prices, fiatBalances])
}
