import { useState, useId } from 'react'
import { X, AlertTriangle, CheckCircle, Loader } from 'lucide-react'
import { OperationWizard, type WizardResult } from './OperationWizard'
import { portfolioApi, type ManualTxPreview, type Transaction, type FifoRunResult } from '../api/portfolio'
import { OP_META } from '../constants/operations'
import { useToast } from '../hooks/useToast'
import { useModalA11y } from '../hooks/useModalA11y'
import { ManualTxPreviewPanel } from './ManualTxPreviewPanel'
import { ManualTxDoneScreen } from './ManualTxDoneScreen'

interface ManualTxModalProps {
  onClose: () => void
  onSuccess: () => void
  transaction?: Transaction
}

function isFeeOperation(operationTypeId: string): boolean {
  return OP_META[operationTypeId]?.group === 'fee'
}

function txToInitialValues(tx: Transaction): { operationTypeId: string; fields: Record<string, unknown> } {
  const isFeeOp = isFeeOperation(tx.operation_type)
  return {
    operationTypeId: tx.operation_type,
    fields: {
      timestamp:   tx.timestamp,
      asset:       isFeeOp ? undefined : tx.asset,
      amount:      isFeeOp ? undefined : tx.amount,
      cost_asset:  tx.cost_asset  ?? undefined,
      cost_amount: tx.cost_amount ?? undefined,
      price_eur:   tx.price_per_unit ?? undefined,
      fee_asset:   tx.fee_asset   ?? undefined,
      fee_amount:  tx.fee_amount  ?? undefined,
      from_wallet: tx.wallet_id,
      to_wallet:   tx.destination_wallet_id ?? undefined,
      notes:       tx.notes ?? undefined,
    },
  }
}

function buildTxData(result: WizardResult): Record<string, unknown> {
  const op = result.operationTypeId
  const isFeeOp = isFeeOperation(op)

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

type Step = 'wizard' | 'preview' | 'saving' | 'done'

export function ManualTxModal({ onClose, onSuccess, transaction }: ManualTxModalProps) {
  const toast = useToast()
  const isEditMode = !!transaction
  const [step, setStep]             = useState<Step>('wizard')
  const [wizardResult, setWizardResult] = useState<WizardResult | null>(null)
  const [preview, setPreview]       = useState<ManualTxPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [fifoStats, setFifoStats]   = useState<FifoRunResult | null>(null)

  const titleId   = useId()
  // Escape cierra igual que la X (decisión del usuario): el riesgo de
  // perder el progreso del wizard ya existe hoy con la X/Cancelar, Escape
  // no añade ningún riesgo nuevo que no pueda darse ya con un click.
  const dialogRef = useModalA11y<HTMLDivElement>(onClose)

  const initialValues = transaction ? txToInitialValues(transaction) : undefined

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
      const result = isEditMode && transaction
        ? await portfolioApi.updateManualTx(transaction.id, data)
        : await portfolioApi.createManualTx(data)

      if (result.fifo) setFifoStats(result.fifo)
      setStep('done')
      onSuccess()

      const successTitle = isEditMode ? 'Transacción actualizada' : 'Transacción guardada'
      if (result.fifoError) {
        // success:true en la respuesta HTTP pero el recálculo FIFO ha
        // fallado (backend/src/routes/transactions.ts) — la transacción se
        // guardó, pero lotes/ganancias pueden estar desactualizados hasta
        // recalcular a mano. Antes este caso se perdía en silencio.
        toast.warning(successTitle, `Guardada, pero el recálculo FIFO falló: ${result.fifoError}`)
      } else {
        toast.success(
          successTitle,
          result.fifo ? `FIFO recalculado · ${result.fifo.lotsCreated} lotes creados` : 'FIFO actualizándose...'
        )
      }
    } catch (e) {
      setError((e as Error).message)
      setStep('preview')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-background-card border border-border rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl"
      >

        {step === 'wizard' && (
          <OperationWizard
            initialValues={initialValues}
            onComplete={handleWizardComplete}
            onCancel={onClose}
          />
        )}

        {(step === 'preview' || step === 'saving') && wizardResult && (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <h2 id={titleId} className="font-semibold text-lg">{isEditMode ? 'Confirmar edición' : 'Confirmar transacción'}</h2>
              <button type="button" onClick={onClose} aria-label="Cerrar" className="text-gray-500 hover:text-white transition-colors p-1">
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
                <ManualTxPreviewPanel preview={preview} wizardResult={wizardResult} />
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
                type="button"
                onClick={() => setStep('wizard')}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                ← {isEditMode ? 'Volver a editar' : 'Volver al wizard'}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={step === 'saving' || previewLoading}
                className="flex items-center gap-2 px-5 py-2 bg-accent-green hover:bg-accent-green/80 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
              >
                {step === 'saving'
                  ? <><Loader size={14} className="animate-spin" /> {isEditMode ? 'Actualizando y recalculando FIFO...' : 'Guardando y recalculando FIFO...'}</>
                  : <><CheckCircle size={14} /> {isEditMode ? 'Confirmar y actualizar' : 'Confirmar y guardar'}</>
                }
              </button>
            </div>
          </>
        )}

        {step === 'done' && (
          <ManualTxDoneScreen
            fifoStats={fifoStats}
            isEditMode={isEditMode}
            onClose={onClose}
            onAddAnother={isEditMode ? undefined : () => {
              setStep('wizard')
              setPreview(null)
              setWizardResult(null)
              setFifoStats(null)
            }}
          />
        )}
      </div>
    </div>
  )
}
