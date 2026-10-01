import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, HardDrive, ArrowRight, X } from 'lucide-react'
import { OperationWizard } from '../components/OperationWizard'
import { ManualTxModal } from '../components/ManualTxModal'
import { useNavigate, Link } from 'react-router-dom'
import { UploadZone } from './import/UploadZone'
import { PreviewStage } from './import/PreviewStage'
import { ProgressStage } from './import/ProgressStage'
import { ImportsList } from './import/ImportsList'
import { PendingDepositsPanel } from './import/PendingDepositsPanel'
import { AdvancedSection } from './import/AdvancedSection'
import type { PreviewResult, ProgressEvent, WizardResult } from './import/types'
import { invalidateTransactionQueries } from '../utils/queryInvalidation'
import { useSetupSeen } from '../hooks/useSetupSeen'
import { portfolioApi } from '../api/portfolio'
import { waitForImportCommit, readProgressStream } from './import/importStream'
import { useWithdrawalDestinations, useDepositCosts, clearImportSessionStorage } from './import/useImportSessionState'

export function ImportPage() {
  const queryClient = useQueryClient()
  const navigate    = useNavigate()
  const fileRef     = useRef<HTMLInputElement>(null)
  const fileBufferRef = useRef<File | null>(null)

  const { setupSeen, markSetupSeen } = useSetupSeen()
  const [stage, setStage] = useState<'upload' | 'preview' | 'catalog' | 'progress' | 'done'>('upload')
  const [exchange, setExchange] = useState<'binance' | 'bitvavo'>('binance')
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [preview, setPreview]   = useState<PreviewResult | null>(null)
  const [catalogingOp, setCatalogingOp] = useState<string | null>(null)
  const [resolvedOps, setResolvedOps]   = useState<Record<string, WizardResult>>({})
  const [withdrawalDestinations, setWithdrawalDestinations] = useWithdrawalDestinations()
  const [depositCosts, setDepositCosts] = useDepositCosts()
  const [progressLog, setProgressLog] = useState<ProgressEvent[]>([])
  const [showTxTable, setShowTxTable] = useState(false)
  const [txPage, setTxPage]           = useState(0)
  const [showManualTx, setShowManualTx] = useState(false)
  const TX_PAGE_SIZE = 20

  const { data: imports = [] } = useQuery({
    queryKey: ['imports'],
    queryFn: portfolioApi.getImports,
  })

  const { data: pendingDeposits = [] } = useQuery({
    queryKey: ['pending-deposits'],
    queryFn: portfolioApi.getPendingDeposits,
  })
  const hasPendingDeposits = pendingDeposits.length > 0

  async function handleFile(file: File) {
    setError(null)
    setLoading(true)
    fileBufferRef.current = file

    try {
      const form = new FormData()
      form.append('file', file)
      form.append('exchange', exchange)
      const res  = await fetch('/api/imports/preview', { method: 'POST', body: form })
      const body: unknown = await res.json()

      if (!res.ok) {
        setError((body as { error?: string }).error || 'Error en preview')
        setLoading(false)
        return
      }

      const data = body as PreviewResult
      setPreview(data)
      setStage('preview')
    } catch {
      setError('Error al procesar el archivo')
    } finally {
      setLoading(false)
    }
  }

  function finishImportSuccess() {
    setStage('done')
    invalidateTransactionQueries(queryClient, { includeImports: true })
    clearImportSessionStorage()
  }

  async function handleConfirm() {
    if (!fileBufferRef.current) return

    const csvDeposits = (preview?.transactions ?? [])
      .filter(tx => (tx.notes ?? '').includes('cripto externo'))
    const unreviewedDeposits = csvDeposits.some(tx => {
      const key = tx.rawRowHashes?.[0] ?? `${tx.timestamp}|${tx.asset}|${tx.amount}`
      return !(key in depositCosts)
    })
    if (unreviewedDeposits) {
      setStage('preview')
      setError('Asigna el coste de adquisición de todos los depósitos externos en el panel de revisión.')
      return
    }

    setStage('progress')
    setProgressLog([])

    const form = new FormData()
    form.append('file', fileBufferRef.current)
    form.append('exchange', exchange)
    if (Object.keys(resolvedOps).length > 0)
      form.append('resolvedOperations', JSON.stringify(resolvedOps))
    if (Object.keys(withdrawalDestinations).length > 0)
      form.append('withdrawalDestinations', JSON.stringify(withdrawalDestinations))
    if (Object.keys(depositCosts).length > 0)
      form.append('depositCosts', JSON.stringify(depositCosts))

    const prevImportCount = imports.length
    let sawTerminal = false

    try {
      const res = await fetch('/api/imports/confirm', { method: 'POST', body: form })

      if (!res.ok) {
        const err = await res.json()
        setProgressLog([{ phase: 'error', message: err.error || 'Error al importar' }])
        return
      }

      sawTerminal = await readProgressStream(res, event => {
        setProgressLog(prev => [...prev, event])
        if (event.phase === 'done') finishImportSuccess()
      })
    } catch {
      // El stream se cortó sin emitir done/error. No asumimos fallo: el backend puede
      // haber terminado igualmente (la importación y el FIFO se comitean en servidor).
      // Se confirma consultando si la importación quedó registrada.
    }

    if (!sawTerminal) {
      const commitado = await waitForImportCommit(prevImportCount)
      if (commitado) {
        finishImportSuccess()
        setProgressLog(prev => [...prev, {
          phase: 'done',
          message: 'Importación completada. La conexión con el navegador se perdió durante el cálculo de precios, pero las transacciones se guardaron correctamente. Recarga la vista para ver el resultado.'
        }])
      } else {
        setProgressLog(prev => [...prev, {
          phase: 'error',
          message: 'Error de conexión: no se ha podido confirmar la importación. Revisa la lista de importaciones antes de reintentar.'
        }])
      }
    }
  }

  function handleReset() {
    setStage('upload')
    setPreview(null)
    setError(null)
    setProgressLog([])
    setResolvedOps({})
    setWithdrawalDestinations({})
    setDepositCosts({})
    fileBufferRef.current = null
    if (fileRef.current) fileRef.current.value = ''
    clearImportSessionStorage()
  }

  async function handleDelete(id: string) {
    await portfolioApi.deleteImport(id)
    invalidateTransactionQueries(queryClient, { includeImports: true })
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {!setupSeen && (
        <div className="flex items-center justify-between gap-4 px-4 py-3 bg-accent-amber/10 border border-accent-amber/30 rounded-lg text-sm">
          <div className="flex items-center gap-3">
            <HardDrive size={15} className="text-accent-amber shrink-0" />
            <span className="text-gray-300">
              ¿Tienes wallets frías? Configúralas antes de importar para que los retiros se asignen correctamente.
            </span>
            <Link
              to="/settings"
              className="flex items-center gap-1 text-accent-amber hover:text-accent-amber/80 font-medium whitespace-nowrap transition-colors"
            >
              Ir a configuración <ArrowRight size={13} />
            </Link>
          </div>
          <button
            type="button"
            onClick={markSetupSeen}
            aria-label="Cerrar aviso"
            className="text-gray-600 hover:text-white transition-colors shrink-0"
          >
            <X size={15} />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Importar CSV</h1>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowManualTx(true)}
            className="flex items-center gap-2 px-4 py-2 bg-background-tertiary hover:bg-border border border-border rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={14} />
            Nueva transaccion
          </button>
          {stage !== 'upload' && (
            <button type="button" onClick={handleReset} className="text-xs text-gray-500 hover:text-white transition-colors">
              Volver al inicio
            </button>
          )}
        </div>
      </div>

      {stage === 'upload' && hasPendingDeposits && (
        <PendingDepositsPanel deposits={pendingDeposits} />
      )}

      {stage === 'upload' && (
        <UploadZone
          dragOver={dragOver}
          loading={loading}
          error={error}
          fileRef={fileRef}
          exchange={exchange}
          onExchangeChange={setExchange}
          onDragOver={setDragOver}
          onFile={handleFile}
        />
      )}

      {stage === 'preview' && preview && (
        <PreviewStage
          preview={preview}
          showTxTable={showTxTable}
          setShowTxTable={setShowTxTable}
          txPage={txPage}
          setTxPage={setTxPage}
          txPageSize={TX_PAGE_SIZE}
          resolvedOps={resolvedOps}
          withdrawalDestinations={withdrawalDestinations}
          depositCosts={depositCosts}
          onWithdrawalDestination={(asset, walletId) =>
            setWithdrawalDestinations(prev => ({ ...prev, [asset]: walletId }))
          }
          onDepositCost={(txKey, price) =>
            setDepositCosts(prev => ({ ...prev, [txKey]: price }))
          }
          onIgnoreOp={(op) =>
            setResolvedOps(prev => ({ ...prev, [op]: { operationTypeId: 'IGNORED', fields: {} } }))
          }
          onCatalog={(op) => { setCatalogingOp(op); setStage('catalog') }}
          onConfirm={handleConfirm}
        />
      )}

      {stage === 'catalog' && catalogingOp && (
        <div className="card p-0 overflow-hidden">
          <OperationWizard
            unknownOperation={
              preview?.unknownOperationSamples?.[catalogingOp] ?? {
                originalLabel: catalogingOp,
                timestamp: new Date().toISOString(),
                asset: '',
                amount: 0,
              }
            }
            onComplete={(result) => {
              setResolvedOps(prev => ({ ...prev, [catalogingOp]: result }))
              setCatalogingOp(null)
              setStage('preview')
            }}
            onCancel={() => { setCatalogingOp(null); setStage('preview') }}
          />
        </div>
      )}

      {(stage === 'progress' || stage === 'done') && (
        <ProgressStage
          log={progressLog}
          done={stage === 'done'}
          onGoToDashboard={() => navigate('/')}
        />
      )}

      {stage === 'upload' && imports.length > 0 && (
        <ImportsList imports={imports} onDelete={handleDelete} />
      )}

      {stage === 'upload' && <AdvancedSection />}

      {showManualTx && (
        <ManualTxModal
          onClose={() => setShowManualTx(false)}
          onSuccess={() => {
            setShowManualTx(false)
            invalidateTransactionQueries(queryClient)
          }}
        />
      )}
    </div>
  )
}
