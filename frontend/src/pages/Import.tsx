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
import { pasoDeStage, ultimasPorExchange, type Paso } from './import/wizard'
import { navIcon } from '../constants/navigation'
import { anadirASeleccion, clasificarArchivo, firmaLote, indicesAConfirmar, type ArchivoSel } from './import/lote'
import { useAvisoSalida } from './import/useAvisoSalida'
import { useTituloImportacion } from './import/useTituloImportacion'

// Firma de la selección: si se vuelven a subir los mismos archivos, se conserva lo asignado (#318, #326).
const FIRMA_KEY = 'import_file_signature'

export function ImportPage() {
  const queryClient = useQueryClient()
  const navigate    = useNavigate()
  const fileRef     = useRef<HTMLInputElement>(null)
  // Archivos elegidos (#326): historiales de transacciones y de retiradas, con su exchange.
  const [seleccion, setSeleccion] = useState<ArchivoSel[]>([])

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
  const [inicioImport, setInicioImport] = useState(0)
  const [showTxTable, setShowTxTable] = useState(false)
  const [txPage, setTxPage]           = useState(0)
  const [showManualTx, setShowManualTx] = useState(false)
  const TX_PAGE_SIZE = 20

  const { data: imports = [] } = useQuery({
    queryKey: ['imports'],
    queryFn: portfolioApi.getImports,
  })

  // Mientras importa: aviso al salir y progreso en el título de la pestaña (#324).
  useAvisoSalida(stage === 'progress')
  useTituloImportacion(progressLog, stage === 'progress' || stage === 'done')

  const { data: pendingDeposits = [] } = useQuery({
    queryKey: ['pending-deposits'],
    queryFn: portfolioApi.getPendingDeposits,
  })
  const hasPendingDeposits = pendingDeposits.length > 0

  // Analiza la selección (uno o varios archivos, #326). Sin exchange forzado, el backend lo detecta.
  async function analizar(sel: ArchivoSel[]) {
    const tx = sel.filter(s => s.tipo === 'transacciones')
    if (tx.length === 0) { setSeleccion(sel); setError('Añade al menos un historial de transacciones'); return }
    setError(null)
    setLoading(true)
    setSeleccion(sel)

    // Otra selección: las asignaciones de la sesión eran de la anterior (#318). La misma: se conservan.
    const firma = firmaLote(sel)
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
      tx.forEach(f => form.append('files', f.file))
      sel.filter(s => s.tipo === 'retiradas').forEach(f => form.append('withdrawals', f.file))
      if (tx.some(f => f.forzado)) form.append('exchanges', JSON.stringify(tx.map(f => f.forzado)))
      const res  = await fetch('/api/imports/preview', { method: 'POST', body: form })
      const body: unknown = await res.json()

      if (!res.ok) {
        setError((body as { error?: string }).error || 'Error en preview')
        return
      }

      const data = body as PreviewResult
      setPreview(data)
      setExchange(data.exchange ?? 'binance')
      setStage('preview')
    } catch {
      setError('Error al procesar los archivos')
    } finally {
      setLoading(false)
    }
  }

  // Archivos soltados o elegidos: se clasifican (transacciones o retiradas) y se añaden a la
  // selección. Con un único historial en una selección vacía se analiza directamente, como siempre.
  async function handleFiles(files: File[]) {
    setError(null)
    const nuevos = await Promise.all(files.map(clasificarArchivo))
    const { seleccion: sig, error: err } = anadirASeleccion(seleccion, nuevos)
    if (err) { setError(err); return }
    if (seleccion.length === 0 && nuevos.filter(n => n.tipo === 'transacciones').length === 1) { await analizar(sig); return }
    setSeleccion(sig)
  }

  const transacciones = seleccion.filter(s => s.tipo === 'transacciones')
  const retiradasSel = seleccion.filter(s => s.tipo === 'retiradas')

  // «Leer como…» de un archivo del lote (índice entre los de transacciones).
  function leerComo(indice: number, ex: 'binance' | 'bitvavo') {
    const objetivo = transacciones[indice]
    if (objetivo) void analizar(seleccion.map(s => (s.id === objetivo.id ? { ...s, forzado: ex } : s)))
  }

  function quitarArchivo(indice: number) {
    const objetivo = transacciones[indice]
    if (!objetivo) return
    const sig = seleccion.filter(s => s.id !== objetivo.id)
    if (sig.some(s => s.tipo === 'transacciones')) { void analizar(sig); return }
    setSeleccion(sig)
    setPreview(null)
    setStage('upload')
  }

  // Añadir o quitar historiales de retiradas desde la revisión: se relee el lote.
  function cambiarRetiradas(file: File | null) {
    if (!file) { void analizar(seleccion.filter(s => s.tipo !== 'retiradas')); return }
    void clasificarArchivo(file).then(n => {
      const { seleccion: sig, error: err } = anadirASeleccion(seleccion, [{ ...n, tipo: 'retiradas', exchange: 'binance' }])
      if (err) { setError(err); return }
      void analizar(sig)
    })
  }

  function finishImportSuccess() {
    setStage('done')
    invalidateTransactionQueries(queryClient, { includeImports: true })
    clearImportSessionStorage()
  }

  async function handleConfirm() {
    if (!preview || transacciones.length === 0) return
    // Solo se envían los archivos con algo nuevo, con el exchange con que se leyeron (#326).
    const archivos = preview.archivos ?? []
    const indices = indicesAConfirmar(archivos)
    if (indices.length === 0) { setError('Ningún archivo del lote se puede importar.'); return }

    // Solo los depósitos que el backend pide revisar: nuevos del archivo y pendientes de la BD (#316).
    const unreviewedDeposits = (preview?.depositReviews ?? []).some(d => !(d.txKey in depositCosts))
    if (unreviewedDeposits) {
      setStage('preview')
      setError('Asigna el coste de adquisición de todos los depósitos externos en el panel de revisión.')
      return
    }

    setStage('progress')
    setProgressLog([])
    setInicioImport(Date.now())

    const form = new FormData()
    indices.forEach(i => form.append('files', transacciones[i].file))
    retiradasSel.forEach(f => form.append('withdrawals', f.file))
    form.append('exchanges', JSON.stringify(indices.map(i => archivos.find(a => a.indice === i)?.exchange ?? exchange)))
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
        setProgressLog(prev => [...prev, { ...event, t: Date.now() }])
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
    setSeleccion([])
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
          seleccion={seleccion}
          onQuitar={id => setSeleccion(prev => prev.filter(s => s.id !== id))}
          onAnalizar={() => { void analizar(seleccion) }}
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
          onCambiarExchange={ex => leerComo(0, ex)}
          onLeerComo={leerComo}
          onQuitarArchivo={quitarArchivo}
          cambiando={loading}
          retiradasNombre={retiradasSel.length === 0 ? null : retiradasSel.length === 1 ? retiradasSel[0].file.name : `${retiradasSel.length} historiales`}
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
          inicio={inicioImport}
          onGoToDashboard={() => navigate('/')}
          onReset={handleReset}
          onVerHistorial={id => navigate(`/history?import=${encodeURIComponent(id)}`)}
          onIrFiscal={year => navigate(year ? `/fiscal?anio=${year}` : '/fiscal')}
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
