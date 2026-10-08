import type { FifoLot, FiatBalance } from '../api/portfolio'
import { aggregateLotsByAsset } from './assetTable'

// Valoración única del portfolio (#150). Dashboard, gráficos de distribución
// y tablas por wallet calculaban el total cada uno por su cuenta; esta
// función fija las reglas en un solo sitio:
//
// - Cripto: cantidad agregada de los lotes abiertos × precio en vivo. Un
//   activo sin precio (ausente, 0 o negativo) vale 0 y se lista en
//   `unpricedAssets`; su coste sí cuenta en `totalCost`.
// - Fiat: suma de saldos tal cual. El backend (/api/fifo/fiat-balances) solo
//   devuelve saldos positivos (> 0,005 €), así que no se filtra aquí.
// - P&L: valor cripto − coste. El saldo fiat no es ganancia ni pérdida.

export interface AssetValuation {
  asset: string
  kind: 'crypto' | 'fiat'
  quantity: number
  cost: number
  price: number | null
  value: number
}

export interface PortfolioValuation {
  assets: AssetValuation[]   // ordenados por valor descendente
  cryptoValue: number
  fiatValue: number
  totalValue: number
  totalCost: number
  pnl: number
  pnlPct: number
  assetCount: number         // activos cripto distintos
  unpricedAssets: string[]
}

export function valuePortfolio(
  lots: readonly FifoLot[],
  prices: Readonly<Record<string, number>>,
  fiatBalances: readonly FiatBalance[],
): PortfolioValuation {
  const assets: AssetValuation[] = []
  const unpricedAssets: string[] = []
  let cryptoValue = 0
  let totalCost = 0

  for (const [asset, { qty, cost }] of aggregateLotsByAsset([...lots])) {
    const live = prices[asset]
    const price = live !== undefined && live > 0 ? live : null
    const value = price === null ? 0 : qty * price
    if (price === null) unpricedAssets.push(asset)
    cryptoValue += value
    totalCost += cost
    assets.push({ asset, kind: 'crypto', quantity: qty, cost, price, value })
  }

  const fiatByAsset = new Map<string, number>()
  for (const b of fiatBalances) {
    fiatByAsset.set(b.asset, (fiatByAsset.get(b.asset) ?? 0) + parseFloat(b.balance))
  }
  let fiatValue = 0
  for (const [asset, balance] of fiatByAsset) {
    fiatValue += balance
    assets.push({ asset, kind: 'fiat', quantity: balance, cost: balance, price: 1, value: balance })
  }

  const pnl = cryptoValue - totalCost
  return {
    assets: assets.sort((a, b) => b.value - a.value),
    cryptoValue,
    fiatValue,
    totalValue: cryptoValue + fiatValue,
    totalCost,
    pnl,
    pnlPct: totalCost > 0 ? (pnl / totalCost) * 100 : 0,
    assetCount: assets.filter(a => a.kind === 'crypto').length,
    unpricedAssets,
  }
}
