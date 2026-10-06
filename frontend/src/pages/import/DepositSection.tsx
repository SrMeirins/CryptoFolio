import type { DepositReview } from './types'
import { DepositAssetGroup } from './DepositAssetGroup'

// Panel de sección de depósitos agrupados por activo
export function DepositSection({ deposits, depositCosts, onSetCost, allReviewed, reviewedCount }: {
  deposits: DepositReview[]
  depositCosts: Record<string, number | null>
  onSetCost: (txKey: string, price: number | null) => void
  allReviewed: boolean
  reviewedCount: number
}) {
  const byAsset: Record<string, DepositReview[]> = {}
  for (const dep of deposits) {
    if (!byAsset[dep.asset]) byAsset[dep.asset] = []
    byAsset[dep.asset].push(dep)
  }

  return (
    <div className="border-t border-border pt-4 space-y-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${allReviewed ? 'text-accent-green' : 'text-accent-amber'}`}>
            {allReviewed ? '✓ Depósitos revisados' : 'Depósitos externos — coste de adquisición'}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
            allReviewed ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-amber/20 text-accent-amber'
          }`}>
            {reviewedCount}/{deposits.length}
          </span>
        </div>
        <p className="text-[11px] text-gray-600">Activos recibidos desde fuera de Binance — el precio de mercado es una estimación, indica tu coste real si lo conoces</p>
      </div>

      {Object.entries(byAsset).map(([asset, deps]) => (
        <DepositAssetGroup
          key={asset}
          asset={asset}
          deposits={deps}
          depositCosts={depositCosts}
          onSetCost={onSetCost}
        />
      ))}
    </div>
  )
}
