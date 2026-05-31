import { useState, useEffect } from 'react'
import { X, AlertTriangle, CheckCircle, TrendingUp, TrendingDown, Loader } from 'lucide-react'
import { OperationWizard, WizardResult } from './OperationWizard'
import { portfolioApi, ManualTxPreview } from '../api/portfolio'
import { formatEur } from '../utils/format'
import { pnlColor } from '../utils/format'

interface ManualTxModalProps {
  onClose: () => void
  onSuccess: () => void
}

type Step = 'wizard' | 'preview' | 'saving'

export function ManualTxModal({ onClose, onSuccess }: ManualTxModalProps) {
  const [step, setStep] = useState<Step>('wizard')
  const [wizardResult, setWizardResult] = useState<WizardResult | null>(null)
  const [preview, setPreview] = useState<ManualTxPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Calcular preview cuando el wizard completa
  async function handleWizardComplete(result: WizardResult) {
    setWizardResult(result)
    setStep('preview')
    setPreviewLoading(true)
    setError(null)

    try {
      const data = buildTxData(result)
      const prev = await portfolioApi.previewManualTx(data)
      setPreview(prev)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleConfirm() {
    if (!wizardResult) return
    setStep('saving')
    setError(null)

    try {
      const data = buildTxData(wizardResult)
      await portfolioApi.createManualTx(data)
      onSuccess()
    } catch (e) {
      setError((e as Error).message)
      setStep('preview')
    }
  }

  function buildTxData(result: WizardResult): Record<string, unknown> {
    return {
      operationType: result.operationTypeId,
      asset: result.fields.asset,
      amount: result.fields.amount,
      amountNet: result.fields.amount,
      costAsset: result.fields.cost_asset ?? null,
      costAmount: result.fields.cost_amount ?? null,
      pricePerUnit: result.fields.price_eur ?? null,
      feeAsset: result.fields.fee_asset ?? null,
      feeAmount: result.fields.fee_amount ?? null,
      wallet_id: result.fields.from_wallet ?? result.fields.to_wallet ?? null,
      timestamp: result.fields.timestamp,
      notes: result.fields.notes ?? null,
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-background-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">

        {step === 'wizard' && (
          <OperationWizard
            onComplete={handleWizardComplete}
            onCancel={onClose}
          />
        )}

        {(step === 'preview' || step === 'saving') && wizardResult && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <h2 className="font-semibold text-lg">Confirmar transacción</h2>
              <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1">
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">

              {/* Resumen de la tx */}
              <div className="bg-background-tertiary rounded-xl p-4 space-y-2 text-sm">
                <h3 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-3">Transacción</h3>
                {Object.entries(wizardResult.fields)
                  .filter(([, v]) => v !== undefined && v !== null && v !== '')
                  .map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-gray-500 capitalize">{k.replace(/_/g, ' ')}</span>
                      <span className="mono text-gray-200">{String(v)}</span>
                    </div>
                  ))
                }
              </div>

              {/* Preview de impacto */}
              {previewLoading && (
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <Loader size={14} className="animate-spin" />
                  Calculando impacto fiscal...
                </div>
              )}

              {preview && !previewLoading && (
                <div className="space-y-3">
                  {/* Precio histórico */}
                  {preview.priceEur != null && (
                    <div className="flex items-center justify-between p-3 bg-background-tertiary rounded-lg text-sm">
                      <span className="text-gray-500">Precio histórico {String(wizardResult.fields.asset)}</span>
                      <span className="mono text-white">{formatEur(preview.priceEur)}</span>
                    </div>
                  )}

                  {/* G/P estimado */}
                  {preview.estimatedGainLoss != null && (
                    <div className={`flex items-center justify-between p-3 rounded-lg text-sm border ${
                      preview.estimatedGainLoss >= 0
                        ? 'bg-accent-green/5 border-accent-green/20'
                        : 'bg-accent-red/5 border-accent-red/20'
                    }`}>
                      <div className="flex items-center gap-2">
                        {preview.estimatedGainLoss >= 0
                          ? <TrendingUp size={14} className="text-accent-green" />
                          : <TrendingDown size={14} className="text-accent-red" />
                        }
                        <span className="text-gray-400">G/P fiscal estimado</span>
                      </div>
                      <span className={`mono font-semibold ${pnlColor(preview.estimatedGainLoss)}`}>
                        {preview.estimatedGainLoss >= 0 ? '+' : ''}{formatEur(preview.estimatedGainLoss)}
                      </span>
                    </div>
                  )}

                  {/* Lotes afectados */}
                  {preview.affectedLots.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Lotes FIFO que se consumirán</p>
                      {preview.affectedLots.map((lot, i) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-background-tertiary rounded-lg text-xs">
                          <span className="text-gray-500 mono">
                            Lote {new Date(lot.openedAt).toLocaleDateString('es-ES')}
                          </span>
                          <div className="flex gap-4">
                            <span className="mono">{lot.consumed.toFixed(4)} unidades</span>
                            <span className="mono text-gray-400">coste {formatEur(lot.costConsumed)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Warnings */}
                  {preview.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 p-3 bg-accent-amber/5 border border-accent-amber/20 rounded-lg text-xs text-accent-amber">
                      <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                      {w}
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 p-3 bg-accent-red/10 border border-accent-red/20 rounded-lg text-sm text-accent-red">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
              <button
                onClick={() => setStep('wizard')}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Volver al wizard
              </button>
              <button
                onClick={handleConfirm}
                disabled={step === 'saving' || previewLoading}
                className="flex items-center gap-2 px-5 py-2 bg-accent-green hover:bg-accent-green/80 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
              >
                {step === 'saving'
                  ? <><Loader size={14} className="animate-spin" /> Guardando...</>
                  : <><CheckCircle size={14} /> Confirmar y guardar</>
                }
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}