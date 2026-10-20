import { AlertTriangle, Play, Info, CheckCircle2, Upload, History } from 'lucide-react'
import { WithdrawalDestinations } from './WithdrawalDestinations'
import { LANG_LABELS } from './types'
import { UnknownOperationsCard } from './UnknownOperationsCard'
import { TransactionsTable } from './TransactionsTable'
import type { PreviewResult, DepositReview, WizardResult } from './types'
import { cardClasses, buttonClasses } from '../../components/ui'
import { nadaQueImportar, newTransactions, newWithdrawals, txKey } from './reviewSelection'
import { EXCHANGE_LABEL, textoPendiente } from './wizard'
import { ExchangeBadge } from './UploadZone'
import { RetiradasCard } from './RetiradasCard'

export function PreviewStage({
  preview, showTxTable, setShowTxTable, txPage, setTxPage, txPageSize,
  resolvedOps, withdrawalDestinations, depositCosts,
  onWithdrawalDestination, onDepositCost, onIgnoreOp, onCatalog, onConfirm, error, onReset, onVerHistorial,
  exchange, onCambiarExchange, cambiando, retiradasNombre, onRetiradas,
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
  exchange: 'binance' | 'bitvavo'
  /** Vuelve a leer el archivo con otro exchange (#318). */
  onCambiarExchange: (ex: 'binance' | 'bitvavo') => void
  cambiando: boolean
  /** Historial de retiradas de Binance aportado (#320). */
  retiradasNombre: string | null
  onRetiradas: (file: File | null) => void
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
  const otro = exchange === 'binance' ? 'bitvavo' : 'binance'
  const deteccion = preview.deteccion
  const chip = (
    <div className="flex items-center gap-2 flex-wrap text-xs">
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-fg-muted">
        <ExchangeBadge exchange={exchange} size={16} />
        {deteccion?.reconocido === false ? 'Leído como' : 'Detectado:'} <span className="text-fg font-medium">{EXCHANGE_LABEL[exchange]}</span>
        {preview.validation.detectedLanguage !== 'unknown' && <> · {LANG_LABELS[preview.validation.detectedLanguage]?.toLowerCase() ?? preview.validation.detectedLanguage}</>}
      </span>
      <button type="button" onClick={() => onCambiarExchange(otro)} disabled={cambiando}
        className="text-brand hover:underline disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 rounded">
        Cambiar a {EXCHANGE_LABEL[otro]}
      </button>
    </div>
  )
  const faltan = textoPendiente({
    retiros: withdrawalTxKeys.filter(k => !withdrawalDestinations[k]).length,
    depositos: depositsForPanel.filter(d => !(d.txKey in depositCosts)).length,
    operaciones: preview.validation.unknownOperations.filter(op => !resolvedOps[op] || resolvedOps[op].operationTypeId === '').length,
  })

  // Archivo no reconocido: se explica qué cabeceras se esperaban y se ofrece elegir (#318).
  if (deteccion && !deteccion.reconocido) {
    return (
      <div className={cardClasses('md', 'space-y-4')} role="alert">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="font-semibold text-fg">No reconocemos el formato de este archivo</h2>
            <p className="text-sm text-fg-muted">Revisa que sea la exportación del historial de transacciones. Las cabeceras esperadas son:</p>
            <ul className="text-xs text-fg-muted space-y-1 mt-2">
              <li><span className="font-medium text-fg">Binance:</span> {deteccion.esperadas.binance}</li>
              <li><span className="font-medium text-fg">Bitvavo:</span> {deteccion.esperadas.bitvavo}</li>
            </ul>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => onCambiarExchange('binance')} disabled={cambiando} className={buttonClasses('secondary', 'sm')}>Leer como Binance</button>
          <button type="button" onClick={() => onCambiarExchange('bitvavo')} disabled={cambiando} className={buttonClasses('secondary', 'sm')}>Leer como Bitvavo</button>
          <button type="button" onClick={onReset} className={buttonClasses('ghost', 'sm')}>Subir otro archivo</button>
        </div>
      </div>
    )
  }

  if (nadaQueImportar(preview)) {
    const range = preview.validation.dateRange
    return (
      <div className={cardClasses('md', 'text-center space-y-4 py-10')} role="status">
        <CheckCircle2 size={36} className="mx-auto text-positive" aria-hidden="true" />
        <div className="space-y-1">
          <div className="flex justify-center mb-2">{chip}</div>
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
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-medium text-sm">Resumen del archivo</h2>
          {chip}
        </div>
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

      {exchange === 'binance' && withdrawals.length > 0 && (
        <RetiradasCard resumen={preview.retiradas} nombre={retiradasNombre} cargando={cambiando}
          onAnadir={f => onRetiradas(f)} onQuitar={() => onRetiradas(null)} />
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

      {/* Barra fija con lo que falta y la acción (#318) */}
      <div className="sticky bottom-0 z-20 -mx-1 px-4 py-3 rounded-xl border border-border bg-background-card/95 backdrop-blur flex items-center justify-between gap-3 flex-wrap shadow-[0_-8px_24px_-16px_rgb(0_0_0/0.5)]">
        <p className={`text-xs ${faltan ? 'text-warning' : 'text-fg-subtle'}`} aria-live="polite">
          {faltan
            ?? (!hasAnythingToDo
              ? 'No hay transacciones nuevas ni depósitos que actualizar'
              : preview.newCount === 0
                ? 'Se actualizarán los costes de los depósitos y se recalculará el FIFO'
                : `Se importarán ${preview.newCount} transacciones y se recalculará el FIFO`)}
        </p>
        <button type="button" onClick={onConfirm} disabled={isBlocked} className={buttonClasses('primary', 'md', 'flex')}>
          <Play size={14} aria-hidden="true" />
          {preview.newCount === 0 && depositsForPanel.length > 0 ? 'Guardar costes y recalcular FIFO' : 'Confirmar e importar'}
        </button>
      </div>
    </div>
  )
}
