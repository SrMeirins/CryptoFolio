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
        <div key={i} className="flex items-start gap-2 p-3 bg-warning/5 border border-warning/20 rounded-lg text-xs text-warning">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          {w}
        </div>
      ))}

      {/* Precio histórico */}
      {preview.priceEur != null && (
        <div className="flex items-center justify-between p-3 bg-background-tertiary rounded-lg text-sm">
          <span className="text-fg-subtle flex items-center gap-1.5">
            <Zap size={12} className="text-brand" /> Precio histórico {asset}
          </span>
          <span className="mono text-fg font-medium">{formatPrice(preview.priceEur)}</span>
        </div>
      )}

      {/* Nuevo lote que se abrirá (BUY / income ops) */}
      {preview.newLot && (
        <div className="p-3 bg-positive/5 border border-positive/20 rounded-lg">
          <div className="flex items-center gap-1.5 text-xs text-positive font-medium mb-2">
            <Package size={12} />
            Lote que se abrirá
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-fg-subtle mb-0.5">Cantidad</p>
              <p className="mono text-fg font-medium">{formatAmount(preview.newLot.quantity)} {preview.newLot.asset}</p>
            </div>
            <div>
              <p className="text-fg-subtle mb-0.5">Coste base</p>
              <p className="mono text-fg font-medium">{formatEur(preview.newLot.costBasisEur)}</p>
            </div>
            <div>
              <p className="text-fg-subtle mb-0.5">Precio/unidad</p>
              <p className="mono text-fg font-medium">{formatPrice(preview.newLot.pricePerUnit)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Lotes de transferencia */}
      {preview.transferLots && preview.transferLots.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-fg-subtle uppercase tracking-wider flex items-center gap-1.5">
            <ArrowRight size={11} /> Lotes que se moverán
          </p>
          {preview.transferLots.map((lot, i) => (
            <div key={i} className="flex items-center justify-between p-2.5 bg-background-tertiary rounded-lg text-xs">
              <span className="text-fg-subtle mono">{new Date(lot.openedAt).toLocaleDateString('es-ES')}</span>
              <span className="mono text-fg">{formatAmount(lot.moved)} {asset}</span>
              <span className="mono text-fg-subtle">{formatPrice(lot.pricePerUnit)} / ud.</span>
            </div>
          ))}
        </div>
      )}

      {/* G/P estimado */}
      {preview.estimatedGainLoss != null && (
        <div className={`flex items-center justify-between p-3 rounded-lg text-sm border ${
          preview.estimatedGainLoss >= 0
            ? 'bg-positive/5 border-positive/20'
            : 'bg-negative/5   border-negative/20'
        }`}>
          <div className="flex items-center gap-2">
            {preview.estimatedGainLoss >= 0
              ? <TrendingUp size={14} className="text-positive" />
              : <TrendingDown size={14} className="text-negative" />
            }
            <span className="text-fg-muted text-sm">G/P fiscal estimado</span>
          </div>
          <span className={`mono font-semibold ${pnlColor(preview.estimatedGainLoss)}`}>
            {preview.estimatedGainLoss >= 0 ? '+' : ''}{formatEur(preview.estimatedGainLoss)}
          </span>
        </div>
      )}

      {/* Lotes consumidos */}
      {preview.affectedLots.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-fg-subtle uppercase tracking-wider">Lotes FIFO que se consumirán</p>
          {preview.affectedLots.map((lot, i) => (
            <div key={i} className="flex items-center justify-between p-2.5 bg-background-tertiary rounded-lg text-xs">
              <span className="text-fg-subtle mono">{new Date(lot.openedAt).toLocaleDateString('es-ES')}</span>
              <div className="flex gap-4 items-center">
                <span className="mono text-fg">{formatAmount(lot.consumed)} {asset}</span>
                <span className="mono text-fg-subtle">coste {formatEur(lot.costConsumed)}</span>
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
