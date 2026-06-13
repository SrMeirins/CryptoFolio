import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
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

const SETUP_KEY = 'cflio_setup_seen'

export function ImportPage() {
  const queryClient = useQueryClient()
  const navigate    = useNavigate()
  const fileRef     = useRef<HTMLInputElement>(null)
  const fileBufferRef = useRef<File | null>(null)

  const [setupSeen, setSetupSeen] = useState(() => localStorage.getItem(SETUP_KEY) === 'true')
  const [stage, setStage] = useState<'upload' | 'preview' | 'catalog' | 'progress' | 'done'>('upload')
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [preview, setPreview]   = useState<PreviewResult | null>(null)
  const [catalogingOp, setCatalogingOp] = useState<string | null>(null)
  const [resolvedOps, setResolvedOps]   = useState<Record<string, WizardResult>>({})
  const [withdrawalDestinations, setWithdrawalDestinations] = useState<Record<string, string>>(() => {
    try { return JSON.parse(sessionStorage.getItem('import_withdrawal_dest') ?? '{}') } catch { return {} }
  })
  const [depositCosts, setDepositCosts] = useState<Record<string, number | null>>(() => {
    try { return JSON.parse(sessionStorage.getItem('import_deposit_costs') ?? '{}') } catch { return {} }
  })
  const [progressLog, setProgressLog] = useState<ProgressEvent[]>([])
  const [showTxTable, setShowTxTable] = useState(false)
  const [txPage, setTxPage]           = useState(0)
  const [showManualTx, setShowManualTx] = useState(false)
  const TX_PAGE_SIZE = 20

  useEffect(() => {
    try { sessionStorage.setItem('import_withdrawal_dest', JSON.stringify(withdrawalDestinations)) } catch { /* ignorar */ }
  }, [withdrawalDestinations])

  useEffect(() => {
    try { sessionStorage.setItem('import_deposit_costs', JSON.stringify(depositCosts)) } catch { /* ignorar */ }
  }, [depositCosts])

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
      const res  = await fetch('/api/imports/preview', { method: 'POST', body: form })
      const data: PreviewResult = await res.json()

      if (!res.ok) {
        setError((data as unknown as { error: string }).error || 'Error en preview')
        setLoading(false)
        return
      }

      setPreview(data)
      setStage('preview')
    } catch {
      setError('Error al procesar el archivo')
    } finally {
      setLoading(false)
    }
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
    if (Object.keys(resolvedOps).length > 0)
      form.append('resolvedOperations', JSON.stringify(resolvedOps))
    if (Object.keys(withdrawalDestinations).length > 0)
      form.append('withdrawalDestinations', JSON.stringify(withdrawalDestinations))
    if (Object.keys(depositCosts).length > 0)
      form.append('depositCosts', JSON.stringify(depositCosts))

    try {
      const res = await fetch('/api/imports/confirm', { method: 'POST', body: form })

      if (!res.ok) {
        const err = await res.json()
        setProgressLog([{ phase: 'error', message: err.error || 'Error al importar' }])
        return
      }

      const reader  = res.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) return

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text  = decoder.decode(value)
        const lines = text.split('\n').filter(l => l.startsWith('data: '))

        for (const line of lines) {
          try {
            const event: ProgressEvent = JSON.parse(line.slice(6))
            setProgressLog(prev => [...prev, event])

            if (event.phase === 'done') {
              setStage('done')
              queryClient.invalidateQueries({ queryKey: ['imports'] })
              queryClient.invalidateQueries({ queryKey: ['fifo-lots'] })
              queryClient.invalidateQueries({ queryKey: ['fiscal-summary'] })
              queryClient.invalidateQueries({ queryKey: ['transactions'] })
              try {
                sessionStorage.removeItem('import_withdrawal_dest')
                sessionStorage.removeItem('import_deposit_costs')
              } catch { /* ignorar */ }
            }
          } catch { /* ignorar */ }
        }
      }
    } catch {
      setProgressLog(prev => [...prev, { phase: 'error', message: 'Error de conexion' }])
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
    try {
      sessionStorage.removeItem('import_withdrawal_dest')
      sessionStorage.removeItem('import_deposit_costs')
    } catch { /* ignorar */ }
  }

  async function handleDelete(id: string) {
    await portfolioApi.deleteImport(id)
    queryClient.invalidateQueries({ queryKey: ['imports'] })
    queryClient.invalidateQueries({ queryKey: ['fifo-lots'] })
    queryClient.invalidateQueries({ queryKey: ['fiscal-summary'] })
    queryClient.invalidateQueries({ queryKey: ['transactions'] })
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
            onClick={() => { localStorage.setItem(SETUP_KEY, 'true'); setSetupSeen(true) }}
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
            onClick={() => setShowManualTx(true)}
            className="flex items-center gap-2 px-4 py-2 bg-background-tertiary hover:bg-border border border-border rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={14} />
            Nueva transaccion
          </button>
          {stage !== 'upload' && (
            <button onClick={handleReset} className="text-xs text-gray-500 hover:text-white transition-colors">
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
            queryClient.invalidateQueries({ queryKey: ['fifo-lots'] })
            queryClient.invalidateQueries({ queryKey: ['fiscal-summary'] })
            queryClient.invalidateQueries({ queryKey: ['transactions'] })
          }}
        />
      )}
    </div>
  )
}
