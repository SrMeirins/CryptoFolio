import { useQuery } from '@tanstack/react-query'
import { portfolioApi, FiatBalance } from '../api/portfolio'
import { AssetTable } from '../components/AssetTable'
import { usePricesStore } from '../store/pricesStore'

export function Portfolio() {
  const prices = usePricesStore((s) => s.prices)

  const { data: lots = [], isLoading } = useQuery({
    queryKey: ['fifo-lots'],
    queryFn: portfolioApi.getLots,
  })

  const { data: fiatBalances = [] } = useQuery({
    queryKey: ['fiat-balances'],
    queryFn: portfolioApi.getFiatBalances,
  })

  const binance = lots.filter((l) => l.wallet_kind === 'exchange')
  const tangem  = lots.filter((l) => l.wallet_kind !== 'exchange')

  // Separar fiat por wallet_kind para mostrarlo en la sección correcta
  const fiatExchange = fiatBalances.filter((b: FiatBalance) => b.wallet_kind === 'exchange')
  const fiatCold     = fiatBalances.filter((b: FiatBalance) => b.wallet_kind !== 'exchange')

  if (isLoading) return <div className="p-6 text-gray-500">Cargando...</div>

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-semibold">Portfolio</h1>

      {(binance.length > 0 || fiatExchange.length > 0) && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-accent-amber uppercase tracking-wider">Binance</h2>
          <AssetTable lots={binance} fiatBalances={fiatExchange} />
        </div>
      )}

      {(tangem.length > 0 || fiatCold.length > 0) && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-accent-purple uppercase tracking-wider">Tangem</h2>
          <AssetTable lots={tangem} fiatBalances={fiatCold} />
        </div>
      )}
    </div>
  )
}
