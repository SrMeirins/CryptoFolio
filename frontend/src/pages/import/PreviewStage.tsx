import { AlertTriangle, Play, Info, CheckCircle2, Upload, History } from 'lucide-react'
import { WithdrawalDestinations } from './WithdrawalDestinations'
import { LANG_LABELS } from './types'
import { UnknownOperationsCard } from './UnknownOperationsCard'
import { TransactionsTable } from './TransactionsTable'
import type { PreviewResult, DepositReview, WizardResult } from './types'
import { cardClasses, buttonClasses } from '../../components/ui'
import { nadaQueImportar, newTransactions, newWithdrawals, txKey } from './reviewSelection'

export function PreviewStage({
  preview, showTxTable, setShowTxTable, txPage, setTxPage, txPageSize,
  resolvedOps, withdrawalDestinations, depositCosts,
  onWithdrawalDestination, onDepositCost, onIgnoreOp, onCatalog, onConfirm, error, onReset, onVerHistorial,
}: {
  preview: PreviewResult
  showTxTable: boolean
  setShowTxTable: (v: boolean) => void
  txPage: number
  setTxPage: (v: number) => void
  txPageSize: number
  resolvedOps: Record<string, WizardResult>
  withdrawalDestinations: Record<string, string>
  depositCosts: Record<string, number | null>
  onWithdrawalDestination: (asset: string, walletId: string) => void
  onDepositCost: (txKey: string, price: number | null) => void
  onIgnoreOp: (op: string) => void
  onCatalog: (op: string) => void
  onConfirm: () => void
  /** Error de la última acción (p. ej. depósitos sin coste al confirmar), visible en esta pantalla (#316). */
  error: string | null
  onReset: () => void
  onVerHistorial: () => void
}) {
  const hasUnresolved = preview.validation.unknownOperations.some(op => !resolvedOps[op] || resolvedOps[op].operationTypeId === '')

  // Solo lo nuevo (#316): las filas ya importadas no se vuelven a revisar.
  const withdrawals = newWithdrawals(preview)
  const withdrawalTxKeys = withdrawals.map(txKey)
  const hasUnassignedWithdrawals = withdrawalTxKeys.some(k => !withdrawalDestinations[k])

  // Los depósitos a revisar los calcula el backend (nuevos y pendientes de la BD), con su precio histórico.
  const depositsForPanel: DepositReview[] = preview.depositReviews
  const allDepositsReviewedInPanel = depositsForPanel.length === 0 ||
    depositsForPanel.every(d => d.txKey in depositCosts)

  const hasAnythingToDo = preview.newCount > 0 || depositsForPanel.length > 0
  const isBlocked = hasUnresolved || hasUnassignedWithdrawals || !allDepositsReviewedInPanel || !hasAnythingToDo
  const newTxs    = newTransactions(preview)

  if (nadaQueImportar(preview)) {
    const range = preview.validation.dateRange
    return (
      <div className={cardClasses('md', 'text-center space-y-4 py-10')} role="status">
        <CheckCircle2 size={36} className="mx-auto text-positive" aria-hidden="true" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-fg">Ya está todo importado</h2>
          <p className="text-sm text-fg-muted">
            Las {preview.duplicateCount} transacciones de este archivo{range ? ` (${range.from} – ${range.to})` : ''} ya estaban en tu historial. No hay nada nuevo que importar.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <button type="button" onClick={onReset} className={buttonClasses('primary', 'sm', 'flex gap-1.5')}><Upload size={13} aria-hidden="true" /> Subir otro archivo</button>
          <button type="button" onClick={onVerHistorial} className={buttonClasses('secondary', 'sm', 'flex gap-1.5')}><History size={13} aria-hidden="true" /> Ver en Historial</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-negative/30 bg-negative/5 px-4 py-3 text-sm text-negative">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" aria-hidden="true" /> {error}
        </p>
      )}
      <div className={cardClasses('md', 'space-y-4')}>
        <h2 className="font-medium text-sm">Resumen del archivo</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-background-tertiary rounded-lg p-3 text-center">
            <div className="text-2xl font-bold mono text-positive">{preview.newCount}</div>
            <div className="text-xs text-fg-subtle mt-1">Transacciones nuevas</div>
          </div>
          <div className="bg-background-tertiary rounded-lg p-3 text-center">
            <div className="text-2xl font-bold mono text-fg-subtle">{preview.duplicateCount}</div>
            <div className="text-xs text-fg-subtle mt-1">Duplicadas</div>
          </div>
          <div className="bg-background-tertiary rounded-lg p-3 text-center">
            <div className="text-lg font-bold mono text-fg">
              {LANG_LABELS[preview.validation.detectedLanguage] ?? preview.validation.detectedLanguage}
            </div>
            <div className="text-xs text-fg-subtle mt-1">Idioma detectado</div>
          </div>
          <div className="bg-background-tertiary rounded-lg p-3 text-center">
            <div className="text-sm font-medium mono text-fg">
              {preview.validation.dateRange
                ? `${preview.validation.dateRange.from} / ${preview.validation.dateRange.to}`
                : '—'
              }
            </div>
            <div className="text-xs text-fg-subtle mt-1">Rango de fechas</div>
          </div>
        </div>

        {preview.validation.warnings.map((w, i) => (
          <div key={i} className="flex items-start gap-2 p-3 bg-warning/5 border border-warning/20 rounded-lg text-xs text-warning">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            {w}
          </div>
        ))}
        {preview.validation.info.map((msg, i) => (
          <div key={i} className="flex items-start gap-2 p-3 bg-info/5 border border-info/20 rounded-lg text-xs text-info">
            <Info size={13} className="shrink-0 mt-0.5" />
            {msg}
          </div>
        ))}
      </div>

      {preview.validation.unknownOperations.length > 0 && (
        <UnknownOperationsCard
          unknownOperations={preview.validation.unknownOperations}
          resolvedOps={resolvedOps}
          unknownOperationSamples={preview.unknownOperationSamples}
          onIgnoreOp={onIgnoreOp}
          onCatalog={onCatalog}
        />
      )}

      {preview.newCount > 0 && (
        <TransactionsTable
          newCount={preview.newCount}
          newTxs={newTxs}
          showTxTable={showTxTable}
          setShowTxTable={setShowTxTable}
          txPage={txPage}
          setTxPage={setTxPage}
          txPageSize={txPageSize}
        />
      )}

      {(withdrawals.length > 0 || depositsForPanel.length > 0) && (
        <WithdrawalDestinations
          withdrawals={withdrawals}
          destinations={withdrawalDestinations}
          onAssign={onWithdrawalDestination}
          deposits={depositsForPanel}
          depositCosts={depositCosts}
          onSetDepositCost={onDepositCost}
        />
      )}

      <div className="flex items-center justify-between pt-2">
        <div className="text-xs text-fg-subtle">
          {hasUnresolved
            ? '⚠ Resuelve todas las operaciones desconocidas antes de confirmar'
            : hasUnassignedWithdrawals
            ? '⚠ Asigna el destino de todos los retiros antes de confirmar'
            : !allDepositsReviewedInPanel
            ? '⚠ Asigna el coste de adquisición de todos los depósitos externos'
            : !hasAnythingToDo
            ? 'No hay transacciones nuevas ni depósitos que actualizar'
            : preview.newCount === 0
            ? 'Se actualizarán los costes de los depósitos y se recalculará el FIFO'
            : `Se importarán ${preview.newCount} transacciones y se recalculará el FIFO automáticamente`
          }
        </div>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isBlocked}
          className={buttonClasses('primary', 'lg', 'flex')}
        >
          <Play size={14} />
          {preview.newCount === 0 && depositsForPanel.length > 0 ? 'Guardar costes y recalcular FIFO' : 'Confirmar e importar'}
        </button>
      </div>
    </div>
  )
}
