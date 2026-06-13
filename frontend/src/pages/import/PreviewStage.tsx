import { AlertCircle, CheckCircle, Eye, ChevronUp, ChevronDown, AlertTriangle, X, Play, Info } from 'lucide-react'
import { WithdrawalDestinations } from './WithdrawalDestinations'
import { LANG_LABELS, OPERATION_LABELS, OPERATION_COLORS, ACCOUNT_COLORS } from './types'
import { AccountChip } from './UploadZone'
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
  const paginated = newTxs.slice(txPage * txPageSize, (txPage + 1) * txPageSize)
  const totalPages = Math.ceil(newTxs.length / txPageSize)

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
        {(preview.validation.info ?? []).map((msg, i) => (
          <div key={i} className="flex items-start gap-2 p-3 bg-accent-blue/5 border border-accent-blue/20 rounded-lg text-xs text-accent-blue">
            <Info size={13} className="shrink-0 mt-0.5" />
            {msg}
          </div>
        ))}
      </div>

      {preview.validation.unknownOperations.length > 0 && (
        <div className="card space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} className="text-accent-amber" />
            <h2 className="font-medium text-sm">Operaciones desconocidas</h2>
          </div>
          <p className="text-xs text-gray-500">
            Cataloga cada operación para incluirla en el cálculo fiscal, o ignórala para excluirla del import.
          </p>
          <div className="space-y-2">
            {preview.validation.unknownOperations.map(op => {
              const resolved  = resolvedOps[op]
              const isIgnored = resolved?.operationTypeId === 'IGNORED'
              const sample    = preview.unknownOperationSamples?.[op]
              return (
                <div key={op} className="flex items-center justify-between p-3 bg-background-tertiary rounded-lg gap-3">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      {!resolved
                        ? <AlertCircle size={14} className="text-accent-amber shrink-0" />
                        : isIgnored
                          ? <X size={14} className="text-gray-500 shrink-0" />
                          : <CheckCircle size={14} className="text-accent-green shrink-0" />
                      }
                      <span className="font-mono text-xs text-gray-300 truncate">{op}</span>
                      {resolved && !isIgnored && (
                        <span className="text-xs text-accent-green shrink-0">{resolved.operationTypeId}</span>
                      )}
                      {isIgnored && <span className="text-xs text-gray-600 shrink-0">Ignorada</span>}
                    </div>
                    {sample && (
                      <div className="text-xs text-gray-600 ml-5">
                        {new Date(sample.timestamp).toLocaleDateString('es-ES')}
                        {sample.asset && ` · ${sample.asset}`}
                        {sample.amount > 0 && ` · ${sample.amount}`}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => onIgnoreOp(op)}
                      className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                        isIgnored
                          ? 'bg-background-card border border-border text-gray-400'
                          : 'text-gray-600 hover:text-gray-300 hover:bg-background-card'
                      }`}
                    >
                      {isIgnored ? 'Ignorada' : 'Ignorar'}
                    </button>
                    <button
                      onClick={() => onCatalog(op)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                        resolved && !isIgnored
                          ? 'bg-background-card text-gray-400 hover:text-white'
                          : isIgnored
                            ? 'bg-background-card text-gray-500 hover:text-white'
                            : 'bg-accent-amber text-black hover:bg-accent-amber/80'
                      }`}
                    >
                      {resolved && !isIgnored ? 'Cambiar' : 'Catalogar'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {preview.newCount > 0 && (
        <div className="card p-0">
          <button
            onClick={() => setShowTxTable(!showTxTable)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-background-tertiary/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Eye size={15} className="text-gray-500" />
              <span className="font-medium text-sm">Ver {preview.newCount} transacciones nuevas</span>
            </div>
            {showTxTable ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
          </button>

          {showTxTable && (
            <div className="border-t border-border">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 uppercase tracking-wider border-b border-border">
                      <th className="text-left px-4 py-2.5">Fecha</th>
                      <th className="text-left px-4 py-2.5">Cuenta</th>
                      <th className="text-left px-4 py-2.5">Tipo</th>
                      <th className="text-left px-4 py-2.5">Activo</th>
                      <th className="text-right px-4 py-2.5">Cantidad</th>
                      <th className="text-right px-4 py-2.5">Coste</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginated.map((tx, i) => (
                      <tr key={i} className="hover:bg-background-tertiary/50">
                        <td className="px-4 py-2.5 text-gray-400 mono">
                          {new Date(tx.timestamp).toLocaleDateString('es-ES')}
                        </td>
                        <td className="px-4 py-2.5">
                          <AccountChip account={tx.account} colors={ACCOUNT_COLORS} />
                        </td>
                        <td className={`px-4 py-2.5 font-medium ${OPERATION_COLORS[tx.operationType] ?? 'text-gray-400'}`}>
                          {OPERATION_LABELS[tx.operationType] ?? tx.operationType}
                        </td>
                        <td className="px-4 py-2.5 mono font-medium">{tx.asset}</td>
                        <td className="px-4 py-2.5 text-right mono">{tx.amountNet.toFixed(4)}</td>
                        <td className="px-4 py-2.5 text-right mono text-gray-400">
                          {tx.costAmount ? `${tx.costAmount.toFixed(2)} ${tx.costAsset}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <button
                    onClick={() => setTxPage(Math.max(0, txPage - 1))}
                    disabled={txPage === 0}
                    className="text-xs text-gray-500 hover:text-white disabled:opacity-30 transition-colors"
                  >
                    Anterior
                  </button>
                  <span className="text-xs text-gray-500">{txPage + 1} / {totalPages}</span>
                  <button
                    onClick={() => setTxPage(Math.min(totalPages - 1, txPage + 1))}
                    disabled={txPage === totalPages - 1}
                    className="text-xs text-gray-500 hover:text-white disabled:opacity-30 transition-colors"
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
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
