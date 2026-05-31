import { useQuery } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
import { AssetTable } from '../components/AssetTable'
import { usePricesStore } from '../store/pricesStore'
import { formatEur } from '../utils/format'

export function Portfolio() {
  const prices = usePricesStore((s) => s.prices)
  const { data: lots = [], isLoading } = useQuery({
    queryKey: ['fifo-lots'],
    queryFn: portfolioApi.getLots,
  })

  const binance = lots.filter((l) => l.wallet_kind === 'exchange')
  const tangem = lots.filter((l) => l.wallet_kind !== 'exchange')

  if (isLoading) return <div className="p-6 text-gray-500">Cargando...</div>

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-semibold">Portfolio</h1>

      {binance.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-accent-amber uppercase tracking-wider">Binance</h2>
          <AssetTable lots={binance} />
        </div>
      )}

      {tangem.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-accent-purple uppercase tracking-wider">Tangem</h2>
          <AssetTable lots={tangem} />
        </div>
      )}
    </div>
  )
}
