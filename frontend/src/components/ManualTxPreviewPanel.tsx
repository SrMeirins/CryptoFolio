import { AlertTriangle, TrendingUp, TrendingDown, ArrowRight, Package, Zap } from 'lucide-react'
import { type ManualTxPreview } from '../api/portfolio'
import { type WizardResult } from './OperationWizard'
import { formatEur, formatPrice, formatAmount, pnlColor } from '../utils/format'

export function ManualTxPreviewPanel({ preview, wizardResult }: {
  preview: ManualTxPreview
  wizardResult: WizardResult
}) {
  const asset = (wizardResult.fields.asset ?? wizardResult.fields.fee_asset) as string

  return (
    <div className="space-y-3">
      {/* Warnings */}
      {preview.warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-2 p-3 bg-accent-amber/5 border border-accent-amber/20 rounded-lg text-xs text-accent-amber">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          {w}
        </div>
      ))}

      {/* Precio histórico */}
      {preview.priceEur != null && (
        <div className="flex items-center justify-between p-3 bg-background-tertiary rounded-lg text-sm">
          <span className="text-gray-500 flex items-center gap-1.5">
            <Zap size={12} className="text-accent-blue" /> Precio histórico {asset}
          </span>
          <span className="mono text-white font-medium">{formatPrice(preview.priceEur)}</span>
        </div>
      )}

      {/* Nuevo lote que se abrirá (BUY / income ops) */}
      {preview.newLot && (
        <div className="p-3 bg-accent-green/5 border border-accent-green/20 rounded-lg">
          <div className="flex items-center gap-1.5 text-xs text-accent-green font-medium mb-2">
            <Package size={12} />
            Lote que se abrirá
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-gray-500 mb-0.5">Cantidad</p>
              <p className="mono text-gray-200 font-medium">{formatAmount(preview.newLot.quantity)} {preview.newLot.asset}</p>
            </div>
            <div>
              <p className="text-gray-500 mb-0.5">Coste base</p>
              <p className="mono text-gray-200 font-medium">{formatEur(preview.newLot.costBasisEur)}</p>
            </div>
            <div>
              <p className="text-gray-500 mb-0.5">Precio/unidad</p>
              <p className="mono text-gray-200 font-medium">{formatPrice(preview.newLot.pricePerUnit)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Lotes de transferencia */}
      {preview.transferLots && preview.transferLots.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
            <ArrowRight size={11} /> Lotes que se moverán
          </p>
          {preview.transferLots.map((lot, i) => (
            <div key={i} className="flex items-center justify-between p-2.5 bg-background-tertiary rounded-lg text-xs">
              <span className="text-gray-500 mono">{new Date(lot.openedAt).toLocaleDateString('es-ES')}</span>
              <span className="mono text-gray-200">{formatAmount(lot.moved)} {asset}</span>
              <span className="mono text-gray-500">{formatPrice(lot.pricePerUnit)} / ud.</span>
            </div>
          ))}
        </div>
      )}

      {/* G/P estimado */}
      {preview.estimatedGainLoss != null && (
        <div className={`flex items-center justify-between p-3 rounded-lg text-sm border ${
          preview.estimatedGainLoss >= 0
            ? 'bg-accent-green/5 border-accent-green/20'
            : 'bg-accent-red/5   border-accent-red/20'
        }`}>
          <div className="flex items-center gap-2">
            {preview.estimatedGainLoss >= 0
              ? <TrendingUp size={14} className="text-accent-green" />
              : <TrendingDown size={14} className="text-accent-red" />
            }
            <span className="text-gray-400 text-sm">G/P fiscal estimado</span>
          </div>
          <span className={`mono font-semibold ${pnlColor(preview.estimatedGainLoss)}`}>
            {preview.estimatedGainLoss >= 0 ? '+' : ''}{formatEur(preview.estimatedGainLoss)}
          </span>
        </div>
      )}

      {/* Lotes consumidos */}
      {preview.affectedLots.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Lotes FIFO que se consumirán</p>
          {preview.affectedLots.map((lot, i) => (
            <div key={i} className="flex items-center justify-between p-2.5 bg-background-tertiary rounded-lg text-xs">
              <span className="text-gray-500 mono">{new Date(lot.openedAt).toLocaleDateString('es-ES')}</span>
              <div className="flex gap-4 items-center">
                <span className="mono text-gray-200">{formatAmount(lot.consumed)} {asset}</span>
                <span className="mono text-gray-500">coste {formatEur(lot.costConsumed)}</span>
                {lot.proceedsEur != null && (
                  <span className={`mono text-xs ${pnlColor(lot.proceedsEur - lot.costConsumed)}`}>
                    {lot.proceedsEur - lot.costConsumed >= 0 ? '+' : ''}{formatEur(lot.proceedsEur - lot.costConsumed)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
