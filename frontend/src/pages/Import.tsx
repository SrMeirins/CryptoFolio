import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
import {
  Upload, FileText, Trash2, RefreshCw, CheckCircle,
  AlertCircle, ChevronDown, ChevronUp, Eye, Play,
  AlertTriangle, Info, ArrowRight
} from 'lucide-react'
import { OperationWizard, WizardResult } from '../components/OperationWizard'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useNavigate } from 'react-router-dom'

interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  detectedLanguage: string
  unknownOperations: string[]
  rowCount: number
  dateRange: { from: string; to: string } | null
}

interface PreviewTransaction {
  operationType: string
  timestamp: string
  asset: string
  amount: number
  amountNet: number
  costAsset?: string
  costAmount?: number
  pricePerUnit?: number
  feeAsset?: string
  feeAmount?: number
  wallet: string
  notes?: string
  subTradeCount: number
}

interface UnknownOperationSample {
  timestamp: string
  asset: string
  amount: number
  originalLabel: string
}

interface PreviewResult {
  validation: ValidationResult
  transactions: PreviewTransaction[]
  duplicateCount: number
  newCount: number
  errors: string[]
  unknownOperationSamples: Record<string, UnknownOperationSample>
}

interface ProgressEvent {
  phase: 'importing' | 'prices' | 'fifo' | 'done' | 'error'
  message: string
  progress?: number
  total?: number
}

const OPERATION_LABELS: Record<string, string> = {
  BUY: 'Compra',
  SELL: 'Venta',
  DEPOSIT_FIAT: 'Deposito EUR',
  WITHDRAW: 'Retirada',
  INTERNAL_TRANSFER: 'Transferencia interna',
  IGNORED: 'Ignorado',
}

const OPERATION_COLORS: Record<string, string> = {
  BUY: 'text-accent-green',
  SELL: 'text-accent-red',
  DEPOSIT_FIAT: 'text-accent-blue',
  WITHDRAW: 'text-accent-amber',
  INTERNAL_TRANSFER: 'text-gray-400',
  IGNORED: 'text-gray-600',
}

const LANG_LABELS: Record<string, string> = {
  en: 'Ingles',
  es: 'Espanol',
  unknown: 'Desconocido',
}

export function ImportPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const fileBufferRef = useRef<File | null>(null)

  const [stage, setStage] = useState<'upload' | 'preview' | 'catalog' | 'progress' | 'done'>('upload')
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [catalogingOp, setCatalogingOp] = useState<string | null>(null)
  const [resolvedOps, setResolvedOps] = useState<Record<string, WizardResult>>({})
  const [progressLog, setProgressLog] = useState<ProgressEvent[]>([])
  const [showTxTable, setShowTxTable] = useState(false)
  const [txPage, setTxPage] = useState(0)
  const TX_PAGE_SIZE = 20

  const { data: imports = [] } = useQuery({
    queryKey: ['imports'],
    queryFn: portfolioApi.getImports,
  })

  async function handleFile(file: File) {
    setError(null)
    setLoading(true)
    fileBufferRef.current = file

    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/imports/preview', { method: 'POST', body: form })
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

    setStage('progress')
    setProgressLog([])

    const form = new FormData()
    form.append('file', fileBufferRef.current)

    if (Object.keys(resolvedOps).length > 0) {
      form.append('resolvedOperations', JSON.stringify(resolvedOps))
    }

    try {
      const res = await fetch('/api/imports/confirm', { method: 'POST', body: form })

      if (!res.ok) {
        const err = await res.json()
        setProgressLog([{ phase: 'error', message: err.error || 'Error al importar' }])
        return
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) return

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
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
    fileBufferRef.current = null
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleDelete(id: string) {
    await portfolioApi.deleteImport(id)
    queryClient.invalidateQueries({ queryKey: ['imports'] })
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['fifo-lots'] })
      queryClient.invalidateQueries({ queryKey: ['fiscal-summary'] })
    }, 3000)
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Importar CSV</h1>
        {stage !== 'upload' && (
          <button
            onClick={handleReset}
            className="text-xs text-gray-500 hover:text-white transition-colors"
          >
            Volver al inicio
          </button>
        )}
      </div>

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
    </div>
  )
}

function UploadZone({ dragOver, loading, error, fileRef, onDragOver, onFile }: {
  dragOver: boolean
  loading: boolean
  error: string | null
  fileRef: React.RefObject<HTMLInputElement>
  onDragOver: (v: boolean) => void
  onFile: (f: File) => void
}) {
  return (
    <div className="space-y-4">
      <div className="card bg-accent-blue/5 border-accent-blue/20 p-4">
        <div className="flex items-start gap-3">
          <Info size={16} className="text-accent-blue shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-medium text-accent-blue">Como exportar tu historial de Binance</p>
            <ol className="text-gray-400 space-y-0.5 list-decimal list-inside">
              <li>Ve a <span className="text-white">Binance &gt; Orders &gt; Transaction History</span></li>
              <li>Pulsa el icono de exportar en la esquina superior derecha</li>
              <li>Selecciona <span className="text-white">Export Transaction Records</span></li>
              <li>Elige el rango de fechas y formato <span className="text-white">CSV</span></li>
              <li>Espera a que se genere y descargalo</li>
            </ol>
            <p className="text-gray-600 mt-1">Soportamos exportaciones en ingles y espanol.</p>
          </div>
        </div>
      </div>

      <div
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer
          ${dragOver ? 'border-accent-blue bg-accent-blue/5' : 'border-border hover:border-gray-500'}
          ${loading ? 'opacity-50 pointer-events-none' : ''}
        `}
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); onDragOver(true) }}
        onDragLeave={() => onDragOver(false)}
        onDrop={e => {
          e.preventDefault()
          onDragOver(false)
          const file = e.dataTransfer.files[0]
          if (file) onFile(file)
        }}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <RefreshCw size={32} className="text-accent-blue animate-spin" />
            <p className="text-gray-400 text-sm">Analizando CSV...</p>
          </div>
        ) : (
          <>
            <Upload size={32} className="mx-auto text-gray-500 mb-3" />
            <p className="text-gray-300 font-medium">Arrastra tu CSV de Binance aqui</p>
            <p className="text-gray-600 text-sm mt-1">o haz click para seleccionar</p>
            <p className="text-gray-700 text-xs mt-3">Transaction History export · Maximo 10MB</p>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }}
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 p-4 bg-accent-red/10 border border-accent-red/20 rounded-lg text-sm text-accent-red">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </div>
  )
}

function PreviewStage({ preview, showTxTable, setShowTxTable, txPage, setTxPage, txPageSize, resolvedOps, onCatalog, onConfirm }: {
  preview: PreviewResult
  showTxTable: boolean
  setShowTxTable: (v: boolean) => void
  txPage: number
  setTxPage: (v: number) => void
  txPageSize: number
  resolvedOps: Record<string, WizardResult>
  onCatalog: (op: string) => void
  onConfirm: () => void
}) {
  const hasUnresolved = preview.validation.unknownOperations.some(op => !resolvedOps[op])
  const newTxs = preview.transactions.slice(0, preview.newCount)
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
      </div>

      {preview.validation.unknownOperations.length > 0 && (
        <div className="card space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} className="text-accent-amber" />
            <h2 className="font-medium text-sm">Operaciones que requieren catalogacion</h2>
          </div>
          <p className="text-xs text-gray-500">
            Las siguientes operaciones no fueron reconocidas. Catalogatlas antes de confirmar.
          </p>
          <div className="space-y-2">
            {preview.validation.unknownOperations.map(op => {
              const resolved = resolvedOps[op]
              const sample = preview.unknownOperationSamples?.[op]
              return (
                <div key={op} className="flex items-center justify-between p-3 bg-background-tertiary rounded-lg">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      {resolved
                        ? <CheckCircle size={14} className="text-accent-green" />
                        : <AlertCircle size={14} className="text-accent-amber" />
                      }
                      <span className="font-mono text-xs text-gray-300">{op}</span>
                      {resolved && (
                        <span className="text-xs text-accent-green">{resolved.operationTypeId}</span>
                      )}
                    </div>
                    {sample && (
                      <div className="text-xs text-gray-600 ml-5">
                        {new Date(sample.timestamp).toLocaleDateString('es-ES')}
                        {sample.asset && ` · ${sample.asset}`}
                        {sample.amount > 0 && ` · ${sample.amount}`}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => onCatalog(op)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      resolved
                        ? 'bg-background-card text-gray-400 hover:text-white'
                        : 'bg-accent-amber text-black hover:bg-accent-amber/80'
                    }`}
                  >
                    {resolved ? 'Cambiar' : 'Catalogar'}
                  </button>
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
                      <th className="text-left px-4 py-2.5">Tipo</th>
                      <th className="text-left px-4 py-2.5">Activo</th>
                      <th className="text-right px-4 py-2.5">Cantidad</th>
                      <th className="text-right px-4 py-2.5">Coste</th>
                      <th className="text-left px-4 py-2.5">Wallet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginated.map((tx, i) => (
                      <tr key={i} className="hover:bg-background-tertiary/50">
                        <td className="px-4 py-2.5 text-gray-400 mono">
                          {new Date(tx.timestamp).toLocaleDateString('es-ES')}
                        </td>
                        <td className={`px-4 py-2.5 font-medium ${OPERATION_COLORS[tx.operationType] ?? 'text-gray-400'}`}>
                          {OPERATION_LABELS[tx.operationType] ?? tx.operationType}
                        </td>
                        <td className="px-4 py-2.5 mono font-medium">{tx.asset}</td>
                        <td className="px-4 py-2.5 text-right mono">{tx.amountNet.toFixed(4)}</td>
                        <td className="px-4 py-2.5 text-right mono text-gray-400">
                          {tx.costAmount ? `${tx.costAmount.toFixed(2)} ${tx.costAsset}` : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            tx.wallet === 'BINANCE'
                              ? 'bg-accent-amber/10 text-accent-amber'
                              : 'bg-accent-purple/10 text-accent-purple'
                          }`}>
                            {tx.wallet}
                          </span>
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

      <div className="flex items-center justify-between pt-2">
        <div className="text-xs text-gray-500">
          {hasUnresolved
            ? 'Resuelve todas las operaciones desconocidas antes de confirmar'
            : preview.newCount === 0
            ? 'No hay transacciones nuevas que importar'
            : `Se importaran ${preview.newCount} transacciones y se recalculara el FIFO automaticamente`
          }
        </div>
        <button
          onClick={onConfirm}
          disabled={hasUnresolved || preview.newCount === 0}
          className="flex items-center gap-2 px-6 py-2.5 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
        >
          <Play size={14} />
          Confirmar e importar
        </button>
      </div>
    </div>
  )
}

function ProgressStage({ log, done, onGoToDashboard }: {
  log: ProgressEvent[]
  done: boolean
  onGoToDashboard: () => void
}) {
  const phases = ['importing', 'prices', 'fifo', 'done']
  const currentPhase = log.length > 0 ? log[log.length - 1].phase : 'importing'
  const currentPhaseIdx = phases.indexOf(currentPhase)

  const phaseLabels: Record<string, string> = {
    importing: 'Importando',
    prices: 'Precios',
    fifo: 'FIFO',
    done: 'Completado',
    error: 'Error',
  }

  return (
    <div className="card space-y-5">
      <div className="flex items-center gap-0">
        {['importing', 'prices', 'fifo', 'done'].map((phase, i) => {
          const isDone = phases.indexOf(phase) < currentPhaseIdx || (done && phase !== 'error')
          const isCurrent = phase === currentPhase && !done
          const isError = currentPhase === 'error'
          return (
            <div key={phase} className="flex-1 flex items-center">
              <div className={`flex-1 h-1 ${i === 0 ? 'rounded-l' : ''} ${i === 3 ? 'rounded-r' : ''} ${
                isDone ? 'bg-accent-green' :
                isCurrent ? 'bg-accent-blue' :
                isError ? 'bg-accent-red' :
                'bg-background-tertiary'
              }`} />
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-4 text-center">
        {['importing', 'prices', 'fifo', 'done'].map(phase => {
          const isDone = phases.indexOf(phase) < currentPhaseIdx || done
          const isCurrent = phase === currentPhase && !done
          return (
            <div key={phase} className={`text-xs ${
              isCurrent ? 'text-accent-blue font-medium' :
              isDone ? 'text-accent-green' :
              'text-gray-600'
            }`}>
              {phaseLabels[phase]}
            </div>
          )
        })}
      </div>

      <div className="bg-black/50 rounded-lg p-4 font-mono text-xs space-y-1 max-h-64 overflow-y-auto">
        {log.length === 0 && <div className="text-gray-600">Iniciando proceso...</div>}
        {log.map((event, i) => (
          <div key={i} className={
            event.phase === 'error' ? 'text-accent-red' :
            event.phase === 'done' ? 'text-accent-green' :
            'text-gray-400'
          }>
            <span className="text-gray-600 mr-2">
              {new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            {event.progress !== undefined && event.total !== undefined
              ? `[${event.progress}/${event.total}] ${event.message}`
              : event.message
            }
          </div>
        ))}
        {!done && currentPhase !== 'error' && (
          <div className="text-accent-blue animate-pulse">|</div>
        )}
      </div>

      {done && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-accent-green text-sm font-medium">
            <CheckCircle size={16} />
            Importacion y calculo FIFO completados.
          </div>
          <button
            onClick={onGoToDashboard}
            className="flex items-center gap-2 px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 rounded-lg text-sm font-medium transition-colors"
          >
            Ver Dashboard
            <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

function ImportsList({ imports, onDelete }: {
  imports: { id: string; filename: string; imported_at: string; row_count: number; skipped_count: number }[]
  onDelete: (id: string) => void
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const confirmTarget = imports.find(i => i.id === confirmId)

  return (
    <>
      <div className="card p-0">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-medium text-sm">CSVs importados</h3>
        </div>
        <div className="divide-y divide-border">
          {imports.map(imp => (
            <div key={imp.id} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                <FileText size={15} className="text-gray-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{imp.filename}</p>
                  <p className="text-xs text-gray-500">
                    {`${new Date(imp.imported_at).toLocaleString('es-ES')} · ${imp.row_count} filas · ${imp.skipped_count} ignoradas`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setConfirmId(imp.id)}
                className="text-gray-600 hover:text-accent-red transition-colors p-1"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {confirmTarget && (
        <ConfirmDialog
          title="Borrar importacion"
          message={`Borrar "${confirmTarget.filename}"? Se eliminaran todas sus transacciones y lotes FIFO. Esta accion no se puede deshacer.`}
          confirmLabel="Borrar"
          danger
          onConfirm={() => {
            onDelete(confirmId!)
            setConfirmId(null)
          }}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </>
  )
}

function AdvancedSection() {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function runFifo() {
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch('/api/fifo/run', { method: 'POST' })
      const data = await res.json()
      setResult(`FIFO recalculado: ${data.lotsCreated} lotes, G/P neto ${(data.totalGainEur + data.totalLossEur).toFixed(2)}`)
      queryClient.invalidateQueries({ queryKey: ['fifo-lots'] })
      queryClient.invalidateQueries({ queryKey: ['fiscal-summary'] })
    } catch {
      setResult('Error al recalcular')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="card p-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-background-tertiary/50 transition-colors"
      >
        <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Opciones avanzadas</span>
        {open ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
      </button>

      {open && (
        <div className="border-t border-border px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Recalcular FIFO manualmente</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Util si modificaste datos directamente en la DB o borraste un import
              </p>
            </div>
            <button
              onClick={runFifo}
              disabled={running}
              className="flex items-center gap-2 px-4 py-2 bg-background-tertiary hover:bg-border disabled:opacity-50 rounded-lg text-xs font-medium transition-colors"
            >
              <RefreshCw size={13} className={running ? 'animate-spin' : ''} />
              {running ? 'Calculando...' : 'Recalcular'}
            </button>
          </div>
          {result && <p className="text-xs text-accent-green">{result}</p>}
        </div>
      )}
    </div>
  )
}