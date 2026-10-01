import type { FifoLot, FiatBalance } from '../../api/portfolio'
import { usePricesStore } from '../../store/pricesStore'
import { aggregateLotsByAsset } from '../../utils/assetTable'

export function usePortfolioTotals(lots: FifoLot[], fiatBalances: FiatBalance[]) {
  const prices = usePricesStore(s => s.prices)

  let totalValue  = 0
  let totalCost   = 0
  let assetsTotal = 0
  let pricesMissing = 0

  for (const [asset, { qty, cost }] of aggregateLotsByAsset(lots)) {
    assetsTotal++
    totalCost += cost
    const price = prices[asset] ?? 0
    if (price > 0) totalValue += qty * price
    else pricesMissing++
  }

  for (const b of fiatBalances) {
    const bal = parseFloat(b.balance)
    if (bal > 0) totalValue += bal
  }

  const pnl    = totalValue - totalCost
  const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0

  return { totalValue, totalCost, pnl, pnlPct, assetsTotal, pricesMissing }
}
