import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
import { useDisplayLots, useDisplayMarket } from './useDisplayMarket'
import { portfolioInventory, type WalletSummary } from '../utils/portfolioInventory'

// Valor de cada wallet en la moneda de visualización (#448), con las mismas
// consultas y el mismo cálculo que Portfolio para que las cifras coincidan.
export function useWalletValues(): { byWallet: ReadonlyMap<string, WalletSummary>; currency: ReturnType<typeof useDisplayMarket>['currency'] } {
  const { data: lots = [] } = useQuery({ queryKey: ['fifo-lots'], queryFn: portfolioApi.getLots })
  const { data: fiatBalances = [] } = useQuery({ queryKey: ['fiat-balances'], queryFn: portfolioApi.getFiatBalances })
  const { data: lockedAmounts = [] } = useQuery({ queryKey: ['locked-amounts'], queryFn: portfolioApi.getLockedAmounts, staleTime: 60_000 })
  const market = useDisplayMarket()
  const displayLots = useDisplayLots(lots, market)
  const byWallet = useMemo(() => {
    const inv = portfolioInventory(displayLots, market.prices, fiatBalances, market.rate ?? 0, lockedAmounts, market.dustThreshold)
    return new Map(inv.wallets.map(w => [w.walletId, w]))
  }, [displayLots, market.prices, fiatBalances, market.rate, lockedAmounts, market.dustThreshold])
  return { byWallet, currency: market.currency }
}
