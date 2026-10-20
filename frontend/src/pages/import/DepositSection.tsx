import type { DepositReview } from './types'
import { DepositAssetGroup } from './DepositAssetGroup'
import { buttonClasses } from '../../components/ui'
import { rellenoConMercado } from './revisionHelpers'

// Depósitos externos agrupados por activo, con relleno masivo al precio de mercado (#321).
export function DepositSection({ deposits, depositCosts, onSetCost, allReviewed, reviewedCount, resaltado }: {
  deposits: DepositReview[]
  depositCosts: Record<string, number | null>
  onSetCost: (txKey: string, price: number | null) => void
  allReviewed: boolean
  reviewedCount: number
  resaltado: string | null
}) {
  const byAsset: Record<string, DepositReview[]> = {}
  for (const dep of deposits) {
    if (!byAsset[dep.asset]) byAsset[dep.asset] = []
    byAsset[dep.asset].push(dep)
  }
  const relleno = rellenoConMercado(deposits, depositCosts)
  const numRelleno = Object.keys(relleno).length

  return (
    <div className="border-t border-border pt-4 space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className={`text-sm font-semibold ${allReviewed ? 'text-positive' : 'text-warning'}`}>
              {allReviewed ? 'Depósitos revisados' : 'Depósitos externos — coste de adquisición'}
            </h3>
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium mono ${allReviewed ? 'bg-positive/20 text-positive' : 'bg-warning/20 text-warning'}`}>
              {reviewedCount}/{deposits.length}
            </span>
          </div>
          <p className="text-xs text-fg-subtle mt-0.5">Activos recibidos desde fuera del exchange. El precio de mercado es una estimación: indica tu coste real si lo conoces.</p>
        </div>
        {numRelleno > 0 && (
          <button type="button" onClick={() => Object.entries(relleno).forEach(([k, p]) => onSetCost(k, p))} className={buttonClasses('secondary', 'sm')}>
            Usar precio de mercado en {numRelleno === 1 ? 'el pendiente' : `los ${numRelleno} pendientes`}
          </button>
        )}
      </div>

      {Object.entries(byAsset).map(([asset, deps]) => (
        <DepositAssetGroup key={asset} asset={asset} deposits={deps} depositCosts={depositCosts} onSetCost={onSetCost} resaltado={resaltado} />
      ))}
    </div>
  )
}
