import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { OperationWizard } from '../components/OperationWizard'
import { ManualTxModal } from '../components/ManualTxModal'
import { useNavigate } from 'react-router-dom'
import { UploadZone } from './import/UploadZone'
import { PreviewStage } from './import/PreviewStage'
import { ProgressStage } from './import/ProgressStage'
import { ImportsList } from './import/ImportsList'
import { PendingDepositsPanel } from './import/PendingDepositsPanel'
import { AdvancedSection } from './import/AdvancedSection'
import type { PreviewResult, ProgressEvent, WizardResult } from './import/types'
import { invalidateTransactionQueries } from '../utils/queryInvalidation'
import { portfolioApi } from '../api/portfolio'
import { waitForImportCommit, readProgressStream } from './import/importStream'
import { useWithdrawalDestinations, useDepositCosts, clearImportSessionStorage } from './import/useImportSessionState'
import { cardClasses, buttonClasses, PageHeader } from '../components/ui'
import { ImportStepper } from './import/ImportStepper'
import { firmaArchivo, pasoDeStage, ultimasPorExchange, type Paso } from './import/wizard'
import { navIcon } from '../constants/navigation'
import { esArchivoRetiradas } from './import/direcciones'

// Firma del archivo de la sesión: si se vuelve a subir el mismo, se conserva lo asignado (#318).
const FIRMA_KEY = 'import_file_signature'

export function ImportPage() {
  const queryClient = useQueryClient()
  const navigate    = useNavigate()
  const fileRef     = useRef<HTMLInputElement>(null)
  const fileBufferRef = useRef<File | null>(null)
  // Historial de retiradas de Binance opcional (#320): se envía junto al de transacciones.
  const retiradasRef = useRef<File | null>(null)
  const [retiradasNombre, setRetiradasNombre] = useState<string | null>(null)

  const [stage, setStage] = useState<'upload' | 'preview' | 'catalog' | 'progress' | 'done'>('upload')
  // Exchange detectado por el backend en la vista previa (#318); «Cambiar» lo fuerza.
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

  async function handleFile(file: File, forzado?: 'binance' | 'bitvavo') {
    setError(null)
    setLoading(true)
    fileBufferRef.current = file

    // Otro archivo: las asignaciones de la sesión eran del anterior (#318). El mismo: se conservan.
    const firma = firmaArchivo(file)
    let anterior: string | null = null
    try { anterior = sessionStorage.getItem(FIRMA_KEY) } catch { /* sin almacenamiento */ }
    if (anterior !== firma) {
      setWithdrawalDestinations({})
      setDepositCosts({})
      setResolvedOps({})
      try { sessionStorage.setItem(FIRMA_KEY, firma) } catch { /* sin almacenamiento */ }
    }

    try {
      const form = new FormData()
      form.append('file', file)
      if (retiradasRef.current) form.append('withdrawals', retiradasRef.current)
      // Sin exchange, el backend lo detecta por las cabeceras.
      if (forzado) form.append('exchange', forzado)
      const res  = await fetch('/api/imports/preview', { method: 'POST', body: form })
      const body: unknown = await res.json()

      if (!res.ok) {
        setError((body as { error?: string }).error || 'Error en preview')
        setLoading(false)
        return
      }

      const data = body as PreviewResult
      setPreview(data)
      setExchange(data.exchange ?? forzado ?? 'binance')
      setStage('preview')
    } catch {
      setError('Error al procesar el archivo')
    } finally {
      setLoading(false)
    }
  }

  // Uno o dos archivos (#320): se distingue el historial de retiradas por su cabecera.
  async function handleFiles(files: File[]) {
    setError(null)
    const tipos = await Promise.all(files.map(esArchivoRetiradas))
    const retiradas = files.filter((_, i) => tipos[i])
    const transacciones = files.filter((_, i) => !tipos[i])
    if (retiradas.length > 1 || transacciones.length > 1) {
      setError('Suelta un único historial de transacciones y, opcionalmente, uno de retiradas')
      return
    }
    if (retiradas[0]) setRetiradas(retiradas[0])
    if (transacciones[0]) await handleFile(transacciones[0])
  }

  function setRetiradas(file: File | null) {
    retiradasRef.current = file
    setRetiradasNombre(file?.name ?? null)
  }

  // Añadir o quitar el historial de retiradas desde la revisión: se relee con el mismo exchange.
  function cambiarRetiradas(file: File | null) {
    setRetiradas(file)
    if (fileBufferRef.current) void handleFile(fileBufferRef.current, exchange)
  }

  function finishImportSuccess() {
    setStage('done')
    invalidateTransactionQueries(queryClient, { includeImports: true })
    clearImportSessionStorage()
  }

  async function handleConfirm() {
    if (!fileBufferRef.current) return

    // Solo los depósitos que el backend pide revisar: nuevos del archivo y pendientes de la BD (#316).
    const unreviewedDeposits = (preview?.depositReviews ?? []).some(d => !(d.txKey in depositCosts))
    if (unreviewedDeposits) {
      setStage('preview')
      setError('Asigna el coste de adquisición de todos los depósitos externos en el panel de revisión.')
      return
    }

    setStage('progress')
    setProgressLog([])

    const form = new FormData()
    form.append('file', fileBufferRef.current)
    if (retiradasRef.current) form.append('withdrawals', retiradasRef.current)
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

  // Volver a un paso anterior desde el indicador (#318): a Subir sin perder lo asignado.
  function irAPaso(paso: Paso) {
    if (paso !== 'subir') return
    if (stage === 'done') { handleReset(); return }
    setStage('upload')
    setPreview(null)
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
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
    setRetiradas(null)
    if (fileRef.current) fileRef.current.value = ''
    clearImportSessionStorage()
    try { sessionStorage.removeItem(FIRMA_KEY) } catch { /* sin almacenamiento */ }
  }

  async function handleDelete(id: string) {
    await portfolioApi.deleteImport(id)
    invalidateTransactionQueries(queryClient, { includeImports: true })
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <PageHeader
        icon={navIcon('/import')}
        title="Importar"
        subtitle="CSV de Binance y Bitvavo, y operaciones manuales"
        actions={<>
          <button
            type="button"
            onClick={() => setShowManualTx(true)}
            className={buttonClasses('secondary', 'md', 'flex')}
          >
            <Plus size={14} />
            Nueva transacción
          </button>
          {stage !== 'upload' && stage !== 'progress' && (
            <button type="button" onClick={handleReset} className="text-xs text-fg-subtle hover:text-fg transition-colors">
              Empezar de nuevo
            </button>
          )}
        </>}
      />

      <ImportStepper actual={pasoDeStage(stage)} onIr={irAPaso} />

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
          onFiles={fs => { void handleFiles(fs) }}
          ultimas={ultimasPorExchange(imports)}
          retiradas={retiradasNombre}
          onQuitarRetiradas={() => setRetiradas(null)}
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
          error={error}
          onReset={handleReset}
          onVerHistorial={() => navigate('/history')}
          exchange={exchange}
          onCambiarExchange={ex => { if (fileBufferRef.current) void handleFile(fileBufferRef.current, ex) }}
          cambiando={loading}
          retiradasNombre={retiradasNombre}
          onRetiradas={cambiarRetiradas}
        />
      )}

      {stage === 'catalog' && catalogingOp && (
        <div className={cardClasses('none', 'overflow-hidden')}>
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
