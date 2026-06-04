import { useState } from 'react'
import {
  X, AlertTriangle, CheckCircle, TrendingUp, TrendingDown,
  Loader, ArrowRight, Package, Zap,
} from 'lucide-react'
import { OperationWizard, WizardResult } from './OperationWizard'
import { portfolioApi, ManualTxPreview } from '../api/portfolio'
import { formatEur, formatPrice, formatAmount, pnlColor } from '../utils/format'
import { useToast } from './Toast'

interface ManualTxModalProps {
  onClose: () => void
  onSuccess: () => void
}

type Step = 'wizard' | 'preview' | 'saving' | 'done'

interface FifoStats {
  lotsCreated: number
  lotsConsumed: number
  totalGainEur: number
  totalLossEur: number
}

export function ManualTxModal({ onClose, onSuccess }: ManualTxModalProps) {
  const toast = useToast()
  const [step, setStep]             = useState<Step>('wizard')
  const [wizardResult, setWizardResult] = useState<WizardResult | null>(null)
  const [preview, setPreview]       = useState<ManualTxPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [fifoStats, setFifoStats]   = useState<FifoStats | null>(null)

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
      const result = await portfolioApi.createManualTx(data) as { success: boolean; fifo?: FifoStats }
      if (result.fifo) setFifoStats(result.fifo)
      setStep('done')
      onSuccess()
      toast.success(
        'Transacción guardada',
        result.fifo ? `FIFO recalculado · ${result.fifo.lotsCreated} lotes creados` : 'FIFO actualizándose...'
      )
    } catch (e) {
      setError((e as Error).message)
      setStep('preview')
    }
  }

  function buildTxData(result: WizardResult): Record<string, unknown> {
    const op = result.operationTypeId
    const isFeeOp = op === 'FEE_NETWORK' || op === 'FEE_EXCHANGE'

    const asset  = isFeeOp ? result.fields.fee_asset  : result.fields.asset
    const amount = isFeeOp ? result.fields.fee_amount : result.fields.amount

    return {
      operationType:        op,
      asset:                asset  ?? null,
      amount:               amount ?? null,
      amountNet:            amount ?? null,
      costAsset:            result.fields.cost_asset  ?? null,
      costAmount:           result.fields.cost_amount ?? null,
      pricePerUnit:         result.fields.price_eur   ?? null,
      feeAsset:             result.fields.fee_asset   ?? null,
      feeAmount:            result.fields.fee_amount  ?? null,
      wallet_id:            result.fields.from_wallet ?? null,
      destinationWalletId:  result.fields.to_wallet   ?? null,
      timestamp:            result.fields.timestamp,
      notes:                result.fields.notes ?? null,
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-background-card border border-border rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl">

        {step === 'wizard' && (
          <OperationWizard
            onComplete={handleWizardComplete}
            onCancel={onClose}
          />
        )}

        {(step === 'preview' || step === 'saving') && wizardResult && (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <h2 className="font-semibold text-lg">Confirmar transacción</h2>
              <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">

              {previewLoading ? (
                <div className="flex items-center gap-2 text-gray-400 text-sm py-6 justify-center">
                  <Loader size={14} className="animate-spin" />
                  Calculando impacto fiscal...
                </div>
              ) : preview ? (
                <PreviewContent preview={preview} wizardResult={wizardResult} />
              ) : null}

              {error && (
                <div className="flex items-start gap-2 p-3 bg-accent-red/10 border border-accent-red/20 rounded-lg text-sm text-accent-red">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
              <button
                onClick={() => setStep('wizard')}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                ← Volver al wizard
              </button>
              <button
                onClick={handleConfirm}
                disabled={step === 'saving' || previewLoading}
                className="flex items-center gap-2 px-5 py-2 bg-accent-green hover:bg-accent-green/80 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
              >
                {step === 'saving'
                  ? <><Loader size={14} className="animate-spin" /> Guardando y recalculando FIFO...</>
                  : <><CheckCircle size={14} /> Confirmar y guardar</>
                }
              </button>
            </div>
          </>
        )}

        {step === 'done' && (
          <DoneScreen fifoStats={fifoStats} onClose={onClose} onAddAnother={() => {
            setStep('wizard')
            setPreview(null)
            setWizardResult(null)
            setFifoStats(null)
          }} />
        )}
      </div>
    </div>
  )
}

// ── PreviewContent ──────────────────────────────────────────────────────────
function PreviewContent({ preview, wizardResult }: { preview: ManualTxPreview & {
  newLot?: { asset: string; quantity: number; costBasisEur: number; pricePerUnit: number }
  transferLots?: { openedAt: string; moved: number; pricePerUnit: number }[]
  affectedLots: { lotId: string; openedAt: string; consumed: number; costConsumed: number; proceedsEur?: number; pricePerUnit: number }[]
}; wizardResult: WizardResult }) {
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

// ── DoneScreen ─────────────────────────────────────────────────────────────
function DoneScreen({
  fifoStats, onClose, onAddAnother,
}: { fifoStats: FifoStats | null; onClose: () => void; onAddAnother: () => void }) {
  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <h2 className="font-semibold text-lg">Transacción guardada</h2>
        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 p-6 flex flex-col items-center justify-center gap-4 text-center">
        <div className="w-12 h-12 rounded-full bg-accent-green/10 border border-accent-green/30 flex items-center justify-center">
          <CheckCircle size={22} className="text-accent-green" />
        </div>
        <div>
          <p className="font-medium text-white mb-1">Guardada correctamente</p>
          <p className="text-sm text-gray-500">El motor FIFO ha recalculado todos los lotes</p>
        </div>

        {fifoStats && (
          <div className="grid grid-cols-2 gap-3 w-full max-w-xs mt-2">
            <div className="bg-background-tertiary rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-white mono">{fifoStats.lotsCreated}</p>
              <p className="text-xs text-gray-500 mt-0.5">Lotes creados</p>
            </div>
            <div className="bg-background-tertiary rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-white mono">{fifoStats.lotsConsumed}</p>
              <p className="text-xs text-gray-500 mt-0.5">Lotes consumidos</p>
            </div>
            {(fifoStats.totalGainEur > 0 || fifoStats.totalLossEur > 0) && (
              <>
                <div className="bg-accent-green/5 border border-accent-green/20 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-accent-green mono">+{formatEur(fifoStats.totalGainEur)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Ganancias</p>
                </div>
                <div className="bg-accent-red/5 border border-accent-red/20 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-accent-red mono">-{formatEur(fifoStats.totalLossEur)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Pérdidas</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
        <button
          onClick={onAddAnother}
          className="text-sm text-accent-blue hover:text-accent-blue/80 transition-colors"
        >
          + Añadir otra transacción
        </button>
        <button
          onClick={onClose}
          className="px-5 py-2 bg-background-tertiary hover:bg-border rounded-lg text-sm font-medium transition-colors"
        >
          Cerrar
        </button>
      </div>
    </>
  )
}
