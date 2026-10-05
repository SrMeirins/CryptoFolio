import { AlertTriangle, Play, Info } from 'lucide-react'
import { WithdrawalDestinations } from './WithdrawalDestinations'
import { LANG_LABELS } from './types'
import { UnknownOperationsCard } from './UnknownOperationsCard'
import { TransactionsTable } from './TransactionsTable'
import type { PreviewResult, DepositReview, WizardResult } from './types'

export function PreviewStage({
  preview, showTxTable, setShowTxTable, txPage, setTxPage, txPageSize,
  resolvedOps, withdrawalDestinations, depositCosts,
  onWithdrawalDestination, onDepositCost, onIgnoreOp, onCatalog, onConfirm,
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
}) {
  const hasUnresolved = preview.validation.unknownOperations.some(op => !resolvedOps[op] || resolvedOps[op].operationTypeId === '')

  const withdrawals = [...preview.transactions.filter(tx => tx.operationType === 'WITHDRAW')]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  const withdrawalTxKeys = withdrawals.map(tx =>
    tx.rawRowHashes?.[0] ?? `${tx.timestamp}|${tx.asset}|${tx.amount}`
  )
  const hasUnassignedWithdrawals = withdrawalTxKeys.some(k => !withdrawalDestinations[k])

  const depositsForPanel: DepositReview[] = preview.transactions
    .filter(tx => (tx.notes ?? '').includes('cripto externo'))
    .map(tx => ({
      txKey:           tx.rawRowHashes?.[0] ?? `${tx.timestamp}|${tx.asset}|${tx.amount}`,
      timestamp:       tx.timestamp,
      asset:           tx.asset,
      amount:          tx.amount,
      historicalPrice: null,
    }))
  const allDepositsReviewedInPanel = depositsForPanel.length === 0 ||
    depositsForPanel.every(d => d.txKey in depositCosts)

  const hasAnythingToDo = preview.newCount > 0 || depositsForPanel.length > 0
  const isBlocked = hasUnresolved || hasUnassignedWithdrawals || !allDepositsReviewedInPanel || !hasAnythingToDo
  const newTxs    = preview.transactions.slice(0, preview.newCount)

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <h2 className="font-medium text-sm">Resumen del archivo</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-background-tertiary rounded-lg p-3 text-center">
            <div className="text-2xl font-bold mono text-accent-green">{preview.newCount}</div>
            <div className="text-xs text-gray-500 mt-1">Transacciones nuevas</div>
          </div>
          <div className="bg-background-tertiary rounded-lg p-3 text-center">
            <div className="text-2xl font-bold mono text-gray-500">{preview.duplicateCount}</div>
            <div className="text-xs text-gray-500 mt-1">Duplicadas</div>
          </div>
          <div className="bg-background-tertiary rounded-lg p-3 text-center">
            <div className="text-lg font-bold mono text-white">
              {LANG_LABELS[preview.validation.detectedLanguage] ?? preview.validation.detectedLanguage}
            </div>
            <div className="text-xs text-gray-500 mt-1">Idioma detectado</div>
          </div>
          <div className="bg-background-tertiary rounded-lg p-3 text-center">
            <div className="text-sm font-medium mono text-gray-300">
              {preview.validation.dateRange
                ? `${preview.validation.dateRange.from} / ${preview.validation.dateRange.to}`
                : '—'
              }
            </div>
            <div className="text-xs text-gray-500 mt-1">Rango de fechas</div>
          </div>
        </div>

        {preview.validation.warnings.map((w, i) => (
          <div key={i} className="flex items-start gap-2 p-3 bg-accent-amber/5 border border-accent-amber/20 rounded-lg text-xs text-accent-amber">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            {w}
          </div>
        ))}
        {preview.validation.info.map((msg, i) => (
          <div key={i} className="flex items-start gap-2 p-3 bg-accent-blue/5 border border-accent-blue/20 rounded-lg text-xs text-accent-blue">
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
        <div className="text-xs text-gray-500">
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
          className="flex items-center gap-2 px-6 py-2.5 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
        >
          <Play size={14} />
          {preview.newCount === 0 && depositsForPanel.length > 0 ? 'Guardar costes y recalcular FIFO' : 'Confirmar e importar'}
        </button>
      </div>
    </div>
  )
}
