import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi, ImportRecord } from '../api/portfolio'
import {
  Upload, FileText, Trash2, RefreshCw, CheckCircle,
  AlertCircle, ChevronDown, ChevronUp, Eye, Play,
  AlertTriangle, Info, ArrowRight, Plus, HardDrive, X, Check, ChevronRight, Zap
} from 'lucide-react'
import { OperationWizard, WizardResult } from '../components/OperationWizard'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ManualTxModal } from '../components/ManualTxModal'
import { useToast } from '../components/Toast'
import { useNavigate, Link } from 'react-router-dom'

const SETUP_KEY = 'cflio_setup_seen'

const ACCOUNT_COLORS: Record<string, string> = {
  'Spot':           '#6366f1',
  'Funding':        '#8b5cf6',
  'Cross Margin':   '#f59e0b',
  'Isolated Margin':'#e74c3c',
  'Futures':        '#e74c3c',
}

function AccountChip({ account }: { account: string }) {
  const color = ACCOUNT_COLORS[account] ?? '#6b7280'
  return (
    <span
      className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-md font-medium"
      style={{ backgroundColor: `${color}18`, color }}
    >
      {account}
    </span>
  )
}

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
  account: string
  notes?: string
  subTradeCount: number
  rawRowHashes?: string[]  // primer hash = txKey único para retiros
}

interface UnknownOperationSample {
  timestamp: string
  asset: string
  amount: number
  originalLabel: string
}

interface DepositReview {
  txKey: string
  timestamp: string
  asset: string
  amount: number
  historicalPrice: number | null
  existingInDb?: boolean  // ya importado en DB sin coste
}

interface PreviewResult {
  validation: ValidationResult
  transactions: PreviewTransaction[]
  duplicateCount: number
  newCount: number
  errors: string[]
  unknownOperationSamples: Record<string, UnknownOperationSample>
  depositReviews: DepositReview[]
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

  const [setupSeen, setSetupSeen] = useState(() => localStorage.getItem(SETUP_KEY) === 'true')
  const [stage, setStage] = useState<'upload' | 'preview' | 'catalog' | 'progress' | 'done'>('upload')
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [catalogingOp, setCatalogingOp] = useState<string | null>(null)
  const [resolvedOps, setResolvedOps] = useState<Record<string, WizardResult>>({})
  // txKey -> walletId: destinos asignados por transacción de retiro (clave = rawRowHashes[0])
  const [withdrawalDestinations, setWithdrawalDestinations] = useState<Record<string, string>>(() => {
    try { return JSON.parse(sessionStorage.getItem('import_withdrawal_dest') ?? '{}') } catch { return {} }
  })
  // txKey → pricePerUnit (null = usuario marcó como "desconocido")
  const [depositCosts, setDepositCosts] = useState<Record<string, number | null>>(() => {
    try { return JSON.parse(sessionStorage.getItem('import_deposit_costs') ?? '{}') } catch { return {} }
  })
  const [progressLog, setProgressLog] = useState<ProgressEvent[]>([])
  const [showTxTable, setShowTxTable] = useState(false)
  const [txPage, setTxPage] = useState(0)
  const [showManualTx, setShowManualTx] = useState(false)
  const TX_PAGE_SIZE = 20

  // Persistir estado de revisión en sessionStorage para sobrevivir recargas accidentales
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

    // Guard: depósitos sin revisar → volver al preview
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

    if (Object.keys(resolvedOps).length > 0) {
      form.append('resolvedOperations', JSON.stringify(resolvedOps))
    }
    if (Object.keys(withdrawalDestinations).length > 0) {
      form.append('withdrawalDestinations', JSON.stringify(withdrawalDestinations))
    }
    // Enviar TODOS los costes revisados incluyendo null ("No sé")
    // El servidor los usa para verificar que el usuario revisó cada depósito
    if (Object.keys(depositCosts).length > 0) {
      form.append('depositCosts', JSON.stringify(depositCosts))
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
    // El backend espera a que FIFO termine antes de responder → invalidamos todo al recibir OK
    await portfolioApi.deleteImport(id)
    queryClient.invalidateQueries({ queryKey: ['imports'] })
    queryClient.invalidateQueries({ queryKey: ['fifo-lots'] })
    queryClient.invalidateQueries({ queryKey: ['fiscal-summary'] })
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Aviso configuracion wallets */}
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
            onClick={() => {
              localStorage.setItem(SETUP_KEY, 'true')
              setSetupSeen(true)
            }}
            className="text-gray-600 hover:text-white transition-colors shrink-0"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Header */}
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
            <button
              onClick={handleReset}
              className="text-xs text-gray-500 hover:text-white transition-colors"
            >
              Volver al inicio
            </button>
          )}
        </div>
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

      {/* Modal transaccion manual */}
      {showManualTx && (
        <ManualTxModal
          onClose={() => setShowManualTx(false)}
          onSuccess={() => {
            setShowManualTx(false)
            queryClient.invalidateQueries({ queryKey: ['fifo-lots'] })
            queryClient.invalidateQueries({ queryKey: ['fiscal-summary'] })
          }}
        />
      )}
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
            <p className="text-gray-300 font-medium">Arrastra tu CSV de Binance aquí</p>
            <p className="text-gray-600 text-sm mt-1">o haz click para seleccionar</p>
            <div className="flex items-center justify-center gap-3 mt-3 text-xs text-gray-700">
              <span>Transaction History export</span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <FileText size={11} />
                Solo .csv
              </span>
              <span>·</span>
              <span>Máximo 10 MB</span>
            </div>
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

// ── Constantes de color ────────────────────────────────────────────────────
const BINANCE_ACCOUNT_COLORS: Record<string, string> = {
  'Spot':             '#6366f1',
  'Funding':          '#8b5cf6',
  'Cross Margin':     '#f59e0b',
  'Isolated Margin':  '#e74c3c',
}

const SPECIAL_DESTINATIONS = [
  {
    id: '__external__',
    icon: '📱',
    label: 'Mi wallet no registrada',
    desc: 'MetaMask, Phantom, Trust Wallet... El activo sigue siendo tuyo.',
    color: '#6b7280',
  },
  {
    id: '__gift__',
    icon: '🎁',
    label: 'Regalo o pago a tercero',
    desc: 'Transmisión patrimonial al precio de mercado del día.',
    color: '#6366f1',
  },
  {
    id: '__lost__',
    icon: '💀',
    label: 'Pérdida de acceso',
    desc: 'Keys perdidas, hack... Pérdida patrimonial registrada en el FIFO.',
    color: '#e74c3c',
  },
]

// ── WithdrawalSelector — picker custom por activo ──────────────────────────
function WithdrawalSelector({ value, coldWallets, onChange }: {
  value: string
  coldWallets: { id: string; name: string; color: string }[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  const special = SPECIAL_DESTINATIONS.find(s => s.id === value)
  const wallet  = coldWallets.find(w => w.id === value)

  function select(v: string) { onChange(v); setOpen(false) }

  // Trigger label
  const trigger = special ? (
    <span className="flex items-center gap-2">
      <span>{special.icon}</span>
      <span className="font-medium" style={{ color: special.color }}>{special.label}</span>
    </span>
  ) : wallet ? (
    <span className="flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: wallet.color }} />
      <span className="font-medium text-accent-green">{wallet.name}</span>
    </span>
  ) : (
    <span className="text-gray-500 text-xs">— Sin asignar (requerido) —</span>
  )

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition-all text-left min-w-40 ${
          open
            ? 'border-accent-blue bg-background-tertiary'
            : value
              ? special?.id === '__lost__'
                ? 'border-accent-red/40 bg-accent-red/8'
                : special?.id === '__gift__'
                  ? 'border-accent-blue/40 bg-accent-blue/8'
                  : special?.id === '__external__'
                    ? 'border-gray-600/40 bg-gray-600/8'
                    : 'border-accent-green/40 bg-accent-green/8'
              : 'border-border bg-background-secondary hover:border-gray-600'
        }`}
      >
        <span className="flex-1">{trigger}</span>
        <ChevronDown size={11} className={`text-gray-500 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-72 rounded-xl border border-border bg-background-card shadow-2xl z-50 overflow-hidden">
          {/* Wallets propias */}
          {coldWallets.length > 0 && (
            <div>
              <p className="px-3 pt-2.5 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Mis wallets
              </p>
              {coldWallets.map(w => (
                <button
                  key={w.id}
                  onClick={() => select(w.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-background-tertiary ${
                    value === w.id ? 'bg-accent-green/8' : ''
                  }`}
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: w.color }} />
                  <span className={`text-sm font-medium ${value === w.id ? 'text-accent-green' : 'text-white'}`}>
                    {w.name}
                  </span>
                  {value === w.id && <Check size={13} className="ml-auto text-accent-green shrink-0" />}
                </button>
              ))}
            </div>
          )}

          {/* Situaciones especiales */}
          <div className={coldWallets.length > 0 ? 'border-t border-border' : ''}>
            <p className="px-3 pt-2.5 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Otros destinos
            </p>
            {SPECIAL_DESTINATIONS.map(s => (
              <button
                key={s.id}
                onClick={() => select(s.id)}
                className={`w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-background-tertiary ${
                  value === s.id ? 'bg-background-tertiary' : ''
                }`}
              >
                <span className="text-base mt-0.5 shrink-0">{s.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: value === s.id ? s.color : 'white' }}>
                    {s.label}
                  </p>
                  <p className="text-xs text-gray-500 leading-tight mt-0.5">{s.desc}</p>
                </div>
                {value === s.id && <Check size={13} className="ml-auto mt-1 shrink-0" style={{ color: s.color }} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Clave única por transacción de retiro
function txKey(tx: PreviewTransaction): string {
  return tx.rawRowHashes?.[0] ?? `${tx.timestamp}|${tx.asset}|${tx.amountNet}`
}

// ── DepositReviewStage ── Stage dedicada (como catalog), imposible saltarse ─
function DepositReviewStage({ transactions, depositCosts, onSetCost, onConfirm, onBack }: {
  transactions: PreviewTransaction[]
  depositCosts: Record<string, number | null>
  onSetCost: (txKey: string, price: number | null) => void
  onConfirm: () => void
  onBack: () => void
}) {
  const deposits: DepositReview[] = transactions
    .filter(tx => (tx.notes ?? '').includes('cripto externo'))
    .map(tx => ({
      txKey:          tx.rawRowHashes?.[0] ?? `${tx.timestamp}|${tx.asset}|${tx.amount}`,
      timestamp:      tx.timestamp,
      asset:          tx.asset,
      amount:         tx.amount,
      historicalPrice: null,
    }))

  const reviewed     = deposits.filter(d => d.txKey in depositCosts).length
  const allReviewed  = reviewed === deposits.length

  return (
    <div className="card space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3 pb-4 border-b border-border">
        <div className="w-9 h-9 rounded-xl bg-accent-amber/15 flex items-center justify-center shrink-0">
          <AlertTriangle size={18} className="text-accent-amber" />
        </div>
        <div className="flex-1">
          <h2 className="font-semibold text-base text-white">Revisión de depósitos externos</h2>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">
            {deposits.length} depósito{deposits.length > 1 ? 's' : ''} recibido{deposits.length > 1 ? 's' : ''} desde fuera de Binance.
            Indica el precio al que los compraste para que el cálculo FIFO y tu declaración fiscal sean correctos.
          </p>
        </div>
        {/* Progreso */}
        <div className="shrink-0 text-right">
          <span className={`text-sm font-bold mono ${allReviewed ? 'text-accent-green' : 'text-accent-amber'}`}>
            {reviewed}/{deposits.length}
          </span>
          <p className="text-[10px] text-gray-600 mt-0.5">revisados</p>
        </div>
      </div>

      {/* Lista de depósitos */}
      <div className="space-y-3">
        {deposits.map(dep => (
          <DepositCostRow
            key={dep.txKey}
            dep={dep}
            cost={depositCosts[dep.txKey]}
            reviewed={dep.txKey in depositCosts}
            onSetCost={onSetCost}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ChevronRight size={14} className="rotate-180" />
          Volver al preview
        </button>
        <button
          onClick={onConfirm}
          disabled={!allReviewed}
          className="flex items-center gap-2 px-6 py-2.5 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
        >
          <Play size={14} />
          {allReviewed ? 'Confirmar e importar' : `Faltan ${deposits.length - reviewed} por revisar`}
        </button>
      </div>
    </div>
  )
}

// ── DepositCostReview ──────────────────────────────────────────────────────
function DepositCostReview({ deposits, costs, onSetCost }: {
  deposits: DepositReview[]
  costs: Record<string, number | null>
  onSetCost: (txKey: string, pricePerUnit: number | null) => void
}) {
  const reviewed  = deposits.filter(d => d.txKey in costs).length
  const total     = deposits.length
  const allDone   = reviewed === total

  return (
    <div className={`card border-2 ${allDone ? 'border-accent-green/30' : 'border-accent-amber/40'} space-y-4`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <AlertTriangle size={16} className={`shrink-0 mt-0.5 ${allDone ? 'text-accent-green' : 'text-accent-amber'}`} />
          <div>
            <h3 className={`font-semibold text-sm ${allDone ? 'text-accent-green' : 'text-accent-amber'}`}>
              {allDone ? '✓ Depósitos revisados' : 'Asigna el coste de adquisición de cada depósito'}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Estos activos llegaron desde fuera de Binance. Obligatorio antes de importar.
            </p>
          </div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
          allDone ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-amber/20 text-accent-amber'
        }`}>
          {reviewed}/{total}
        </span>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {deposits.map(dep => (
          <DepositCostRow
            key={dep.txKey}
            dep={dep}
            cost={costs[dep.txKey]}
            reviewed={dep.txKey in costs}
            onSetCost={onSetCost}
          />
        ))}
      </div>
    </div>
  )
}

// ── DepositSection ── depósitos agrupados por activo (sin dropdowns, inline) ─
function DepositSection({ deposits, depositCosts, onSetCost, allReviewed, reviewedCount }: {
  deposits: DepositReview[]
  depositCosts: Record<string, number | null>
  onSetCost: (txKey: string, price: number | null) => void
  allReviewed: boolean
  reviewedCount: number
}) {
  const byAsset: Record<string, DepositReview[]> = {}
  for (const dep of deposits) {
    if (!byAsset[dep.asset]) byAsset[dep.asset] = []
    byAsset[dep.asset].push(dep)
  }

  return (
    <div className="border-t border-border pt-4 space-y-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${allReviewed ? 'text-accent-green' : 'text-accent-amber'}`}>
            {allReviewed ? '✓ Depósitos revisados' : 'Depósitos externos — coste de adquisición'}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
            allReviewed ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-amber/20 text-accent-amber'
          }`}>
            {reviewedCount}/{deposits.length}
          </span>
        </div>
        <p className="text-[11px] text-gray-600">Activos recibidos desde fuera de Binance</p>
      </div>

      {Object.entries(byAsset).map(([asset, deps]) => (
        <DepositAssetGroup
          key={asset}
          asset={asset}
          deposits={deps}
          depositCosts={depositCosts}
          onSetCost={onSetCost}
        />
      ))}
    </div>
  )
}

function DepositAssetGroup({ asset, deposits, depositCosts, onSetCost }: {
  asset: string
  deposits: DepositReview[]
  depositCosts: Record<string, number | null>
  onSetCost: (txKey: string, price: number | null) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const reviewedCount = deposits.filter(d => d.txKey in depositCosts).length
  const allReviewed   = reviewedCount === deposits.length
  const totalAmt      = deposits.reduce((s, d) => s + d.amount, 0)
  const hasMany       = deposits.length > 1

  function applyAll(price: number | null) {
    deposits.forEach(d => onSetCost(d.txKey, price))
  }

  return (
    <div className={`rounded-xl border ${allReviewed ? 'border-accent-green/30' : 'border-border'}`}>
      {/* Cabecera grupo */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-t-xl ${allReviewed ? 'bg-accent-green/5' : 'bg-background-tertiary/60'}`}>
        <div className={`w-2 h-2 rounded-full shrink-0 ${
          allReviewed ? 'bg-accent-green' : reviewedCount > 0 ? 'bg-accent-amber' : 'bg-gray-600'
        }`} />
        <span className="font-bold mono text-sm">{asset}</span>
        <span className="text-xs text-gray-500">
          {hasMany
            ? `${deposits.length} entradas · ${totalAmt.toLocaleString('es-ES', { maximumFractionDigits: 6 })}`
            : `${totalAmt.toLocaleString('es-ES', { maximumFractionDigits: 6 })} · ${
                new Date(deposits[0].timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
              }`
          }
        </span>
        <div className="flex-1" />

        {/* Acciones masivas del grupo */}
        {hasMany && (
          <div className="flex items-center gap-1.5">
            <HistoricalPriceButton asset={asset} timestamp={deposits[0].timestamp} onPrice={applyAll} label="Hist. a todos" />
            <button onClick={() => applyAll(0)}
              className="text-[10px] px-2 py-1 rounded-md border border-border text-gray-500 hover:text-white hover:border-gray-500 bg-background-card transition-colors">
              Gratis a todos
            </button>
            <button onClick={() => applyAll(null)}
              className="text-[10px] px-2 py-1 rounded-md border border-border text-gray-500 hover:text-white hover:border-gray-500 bg-background-card transition-colors">
              No sé a todos
            </button>
          </div>
        )}

        {hasMany && (
          <button onClick={() => setExpanded(e => !e)} className="text-gray-500 hover:text-gray-300 transition-colors ml-1">
            <ChevronDown size={13} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}

        {allReviewed && (
          <span className="text-[10px] text-accent-green flex items-center gap-0.5">
            <Check size={9} /> listo
          </span>
        )}
      </div>

      {/* Filas individuales */}
      {expanded && (
        <div className="divide-y divide-border/50">
          {deposits.map(dep => (
            <DepositRow
              key={dep.txKey}
              dep={dep}
              cost={depositCosts[dep.txKey]}
              reviewed={dep.txKey in depositCosts}
              onSetCost={onSetCost}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Botón auto-fetch precio histórico con estado de error
function HistoricalPriceButton({ asset, timestamp, onPrice, label = 'Precio histórico' }: {
  asset: string
  timestamp: string
  onPrice: (p: number) => void
  label?: string
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')

  async function fetch_() {
    setState('loading')
    try {
      const dateStr = new Date(timestamp).toISOString().slice(0, 10)
      const res = await fetch(`/api/prices/historical?asset=${asset}&date=${dateStr}`)
      if (res.ok) {
        const d = await res.json()
        if (d.price_eur > 0) { onPrice(d.price_eur); setState('idle') }
        else setState('error')
      } else { setState('error') }
    } catch { setState('error') }
  }

  if (state === 'error') {
    return (
      <button onClick={() => setState('idle')}
        className="text-[10px] px-2 py-1 rounded-md border border-accent-red/40 text-accent-red bg-accent-red/5 transition-colors">
        Sin precio en Binance ✕
      </button>
    )
  }

  return (
    <button onClick={fetch_} disabled={state === 'loading'}
      className="text-[10px] px-2 py-1 rounded-md border border-accent-blue/30 text-accent-blue bg-accent-blue/5 hover:bg-accent-blue/15 transition-colors disabled:opacity-50 flex items-center gap-1">
      {state === 'loading' ? <RefreshCw size={9} className="animate-spin" /> : <Zap size={9} />}
      {label}
    </button>
  )
}

// Fila de depósito individual — botones inline, sin dropdowns
function DepositRow({ dep, cost, reviewed, onSetCost }: {
  dep: DepositReview
  cost: number | null | undefined
  reviewed: boolean
  onSetCost: (txKey: string, v: number | null) => void
}) {
  const [inputVal, setInputVal] = useState(cost != null ? String(cost) : '')
  const date = new Date(dep.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })

  function handleInput(val: string) {
    setInputVal(val)
    const n = parseFloat(val.replace(',', '.'))
    if (!isNaN(n) && n >= 0) onSetCost(dep.txKey, n)
    else if (val === '') onSetCost(dep.txKey, undefined as unknown as null)
  }

  const isReviewed  = reviewed
  const statusLabel = !isReviewed   ? null
    : cost != null                  ? `${cost.toLocaleString('es-ES', { maximumFractionDigits: 6 })} €/ud.`
    : 'desconocido'

  return (
    <div className="px-4 py-3">
      {/* Fila superior: fecha + cantidad */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-gray-400 mono">{date}</span>
        <span className="text-xs text-gray-600">·</span>
        <span className="text-xs text-gray-300 mono">
          {dep.amount.toLocaleString('es-ES', { maximumFractionDigits: 6 })} {dep.asset}
        </span>
        {statusLabel && (
          <span className={`ml-auto text-[10px] font-medium ${cost != null ? 'text-accent-green' : 'text-gray-500'}`}>
            {cost != null ? `✓ ${statusLabel}` : `○ ${statusLabel}`}
          </span>
        )}
        {!isReviewed && (
          <span className="ml-auto text-[10px] text-accent-amber">● pendiente</span>
        )}
      </div>

      {/* Fila inferior: acciones */}
      <div className="flex items-center gap-2">
        {/* Input precio sin flechas */}
        <div className="relative flex items-center flex-1 max-w-48">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0,000000"
            value={inputVal}
            onChange={e => handleInput(e.target.value)}
            className={`w-full bg-background-primary border rounded-lg pl-3 pr-12 py-1.5 text-xs text-white placeholder-gray-700 focus:outline-none mono transition-colors ${
              isReviewed && cost != null ? 'border-accent-green/40 focus:border-accent-green' : 'border-border focus:border-accent-blue'
            }`}
          />
          <span className="absolute right-3 text-[10px] text-gray-600 pointer-events-none">€/ud.</span>
        </div>

        {/* Precio histórico */}
        <HistoricalPriceButton
          asset={dep.asset}
          timestamp={dep.timestamp}
          onPrice={p => { setInputVal(String(p)); onSetCost(dep.txKey, p) }}
        />

        {/* Gratis */}
        <button
          onClick={() => { setInputVal('0'); onSetCost(dep.txKey, 0) }}
          className={`text-[10px] px-2.5 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
            cost === 0 && isReviewed
              ? 'border-accent-green/40 bg-accent-green/10 text-accent-green'
              : 'border-border text-gray-500 hover:text-white hover:border-gray-500 bg-background-card'
          }`}
          title="Coste 0€ — airdrop, regalo, minería, etc."
        >
          Gratis (0€)
        </button>

        {/* No sé */}
        <button
          onClick={() => { setInputVal(''); onSetCost(dep.txKey, null) }}
          className={`text-[10px] px-2.5 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
            cost == null && isReviewed
              ? 'border-gray-600 bg-gray-800 text-gray-300'
              : 'border-border text-gray-500 hover:text-white hover:border-gray-500 bg-background-card'
          }`}
          title="Coste desconocido — se usará el precio de mercado en la fecha"
        >
          No sé
        </button>
      </div>
    </div>
  )
}

// ── WithdrawalDestinations ─────────────────────────────────────────────────
function WithdrawalDestinations({ withdrawals, destinations, onAssign, deposits, depositCosts, onSetDepositCost }: {
  withdrawals: PreviewTransaction[]
  destinations: Record<string, string>
  onAssign: (txKey: string, walletId: string) => void
  deposits: DepositReview[]
  depositCosts: Record<string, number | null>
  onSetDepositCost: (txKey: string, price: number | null) => void
}) {
  const [bulkDest,  setBulkDest]  = useState('')
  const [selected,  setSelected]  = useState<Set<string>>(new Set())  // Set<txKey>
  const [expanded,  setExpanded]  = useState<Set<string>>(new Set())  // Set<asset> expandidos

  const { data: wallets = [] } = useQuery({
    queryKey: ['wallets'],
    queryFn: () => fetch('/api/wallets').then(r => r.json()),
  })
  const allNonExchangeWallets = (wallets as { id: string; name: string; type: string; color: string }[])
    .filter(w => w.type !== 'exchange')
  const coldWallets = allNonExchangeWallets.filter(w => w.name !== 'Wallets externas')

  const sortedWithdrawals = [...withdrawals].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
  const byAsset = sortedWithdrawals.reduce<Record<string, PreviewTransaction[]>>((acc, tx) => {
    if (!acc[tx.asset]) acc[tx.asset] = []
    acc[tx.asset].push(tx)
    return acc
  }, {})
  const uniqueAssets = Object.entries(byAsset)
    .sort((a, b) => new Date(a[1][0].timestamp).getTime() - new Date(b[1][0].timestamp).getTime())
    .map(([asset]) => asset)

  // Progreso retiros
  const allTxKeys     = withdrawals.map(txKey)
  const assignedCount = allTxKeys.filter(k => destinations[k]).length
  const totalTxs      = allTxKeys.length
  const allAssigned   = assignedCount === totalTxs

  // Progreso depósitos
  const depositsReviewedCount = deposits.filter(d => d.txKey in depositCosts).length
  const allDepositsReviewed   = deposits.length === 0 || depositsReviewedCount === deposits.length

  // Progreso global (retiros + depósitos)
  const totalItems    = totalTxs + deposits.length
  const doneItems     = assignedCount + depositsReviewedCount
  const allDone       = allAssigned && allDepositsReviewed
  const progress      = totalItems > 0 ? (doneItems / totalItems) * 100 : 0
  const selectedCount = selected.size
  const unassignedKeys = allTxKeys.filter(k => !destinations[k])

  const allChecked  = selectedCount === totalTxs
  const someChecked = selectedCount > 0 && !allChecked

  function toggleTx(key: string) {
    setSelected(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })
  }
  function toggleGroup(txs: PreviewTransaction[]) {
    const keys = txs.map(txKey)
    const allIn = keys.every(k => selected.has(k))
    setSelected(prev => {
      const s = new Set(prev)
      keys.forEach(k => allIn ? s.delete(k) : s.add(k))
      return s
    })
  }
  function selectAll()        { setSelected(new Set(allTxKeys)) }
  function selectUnassigned() { setSelected(new Set(unassignedKeys)) }
  function selectNone()       { setSelected(new Set()) }
  function toggleAll()        { allChecked ? selectNone() : selectAll() }
  function toggleExpand(asset: string) {
    setExpanded(prev => { const s = new Set(prev); s.has(asset) ? s.delete(asset) : s.add(asset); return s })
  }

  function applyBulk() {
    if (!bulkDest) return
    const targets = selectedCount > 0 ? [...selected] : allTxKeys
    targets.forEach(k => onAssign(k, bulkDest))
    setSelected(new Set())
  }
  function applyToGroup(txs: PreviewTransaction[]) {
    if (!bulkDest) return
    txs.forEach(tx => onAssign(txKey(tx), bulkDest))
  }
  function applyToUnassigned() {
    if (!bulkDest) return
    unassignedKeys.forEach(k => onAssign(k, bulkDest))
  }

  // Estado de un grupo
  function groupStatus(txs: PreviewTransaction[]) {
    const dests = txs.map(tx => destinations[txKey(tx)]).filter(Boolean)
    if (dests.length === 0) return { label: null, color: 'text-gray-600' }
    const unique = [...new Set(dests)]
    if (unique.length === 1) return { label: unique[0], color: 'text-accent-green' }
    return { label: 'múltiples', color: 'text-accent-amber' }
  }

  const fmtAmt = (n: number) => {
    if (Math.abs(n) >= 1000) return n.toLocaleString('es-ES', { maximumFractionDigits: 4 })
    if (Math.abs(n) >= 1)    return n.toFixed(6)
    return n.toFixed(8)
  }

  function destLabel(dest: string) {
    if (dest === '__lost__')     return { text: '💀 Pérdida',    cls: 'text-accent-red' }
    if (dest === '__gift__')     return { text: '🎁 Regalo',     cls: 'text-accent-blue' }
    if (dest === '__external__') return { text: '📱 Externa',    cls: 'text-gray-400' }
    const w = coldWallets.find(w => w.id === dest)
    return w ? { text: w.name, cls: 'text-accent-green' } : { text: 'pendiente', cls: 'text-gray-600 italic' }
  }

  return (
    <div className={`rounded-2xl border-2 transition-all duration-300 ${
      allDone ? 'border-accent-green/40' : 'border-accent-amber/40'
    }`}>
      {/* Header con progreso */}
      <div className={`px-5 py-4 ${allDone ? 'bg-accent-green/8' : 'bg-accent-amber/8'}`}>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold ${allDone ? 'text-accent-green' : 'text-accent-amber'}`}>
                {allDone ? '✓ Revisión completada' : 'Revisión obligatoria antes de importar'}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                allDone ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-amber/20 text-accent-amber'
              }`}>
                {doneItems}/{totalItems}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Asigna el destino de cada retiro y el coste de cada depósito externo.
            </p>
          </div>
          <div className="text-right shrink-0">
            <span className="text-xs text-gray-600">{withdrawals.length} retiro{withdrawals.length !== 1 ? 's' : ''}</span>
            {deposits.length > 0 && <span className="text-xs text-gray-600 ml-2">{deposits.length} depósito{deposits.length !== 1 ? 's' : ''}</span>}
          </div>
        </div>
        <div className="h-1.5 bg-background-tertiary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-accent-green' : 'bg-accent-amber'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="p-5 space-y-4 bg-background-card max-h-[70vh] overflow-y-auto">
        {coldWallets.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-accent-amber bg-accent-amber/10 rounded-xl px-4 py-3 border border-accent-amber/20">
            <AlertTriangle size={13} className="shrink-0" />
            No tienes wallets frías configuradas. Ve a Configuración → Wallets antes de importar.
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-background-tertiary">
            {/* Selector + acciones */}
            <div className="flex items-center gap-3 px-4 py-3">
              {/* Checkbox master tri-state */}
              <button
                onClick={toggleAll}
                className={`w-4.5 h-4.5 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
                  allChecked  ? 'bg-accent-blue border-accent-blue' :
                  someChecked ? 'bg-accent-blue/30 border-accent-blue' :
                                'border-gray-600 hover:border-gray-400'
                }`}
                title={allChecked ? 'Deseleccionar todo' : 'Seleccionar todo'}
              >
                {allChecked  && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
                {someChecked && <span className="text-accent-blue text-[10px] font-bold leading-none">−</span>}
              </button>

              {/* Selector de destino */}
              <div className="flex-1 min-w-0">
                <WithdrawalSelector value={bulkDest} coldWallets={coldWallets} onChange={setBulkDest} />
              </div>

              {/* Botones de acción */}
              <div className="flex items-center gap-2 shrink-0">
                {selectedCount > 0 ? (
                  /* Aplicar a seleccionados */
                  <button
                    onClick={applyBulk}
                    disabled={!bulkDest}
                    className="px-3 py-1.5 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-semibold transition-colors whitespace-nowrap flex items-center gap-1.5"
                  >
                    <span className="bg-white/20 rounded px-1 py-0.5 text-[10px] font-bold">{selectedCount}</span>
                    Aplicar
                  </button>
                ) : (
                  <>
                    {unassignedKeys.length > 0 && unassignedKeys.length < totalTxs && (
                      <button
                        onClick={applyToUnassigned}
                        disabled={!bulkDest}
                        className="px-3 py-1.5 border border-border hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-medium text-gray-300 transition-colors whitespace-nowrap"
                        title="Aplicar solo a los que aún no tienen destino"
                      >
                        No asignados
                      </button>
                    )}
                    <button
                      onClick={applyBulk}
                      disabled={!bulkDest}
                      className="px-3 py-1.5 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
                    >
                      Todos
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Barra de selección rápida — visible solo cuando hay selección */}
            {selectedCount > 0 && (
              <div className="border-t border-border px-4 py-2 flex items-center gap-3">
                <span className="text-xs text-accent-blue font-medium">
                  {selectedCount} seleccionado{selectedCount !== 1 ? 's' : ''}
                </span>
                <div className="flex items-center gap-2 ml-auto">
                  <button onClick={selectUnassigned} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">no asignados</button>
                  <span className="text-gray-700">·</span>
                  <button onClick={selectAll}  className="text-xs text-gray-500 hover:text-gray-300 transition-colors">todos</button>
                  <span className="text-gray-700">·</span>
                  <button onClick={selectNone} className="text-xs text-gray-500 hover:text-accent-red transition-colors">ninguno</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Grupos por activo */}
        <div className="space-y-3">
          {uniqueAssets.map(asset => {
            const txs      = byAsset[asset]
            const keys     = txs.map(txKey)
            const totalAmt = txs.reduce((s, t) => s + t.amountNet, 0)
            const firstDate = new Date(txs[0].timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })
            const groupAllSelected = keys.every(k => selected.has(k))
            const groupSomeSelected = keys.some(k => selected.has(k)) && !groupAllSelected
            const status   = groupStatus(txs)
            const assetAssignedCount = keys.filter(k => destinations[k]).length
            const isOpen   = expanded.has(asset) || txs.length === 1

            return (
              <div key={asset} className="rounded-xl border border-border">
                {/* Cabecera del grupo ─────────────────────────────────── */}
                <div className="flex items-center gap-3 px-4 py-3 bg-background-tertiary/60">
                  {/* Checkbox grupo */}
                  <button
                    onClick={() => toggleGroup(txs)}
                    className={`w-4 h-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
                      groupAllSelected  ? 'bg-accent-blue border-accent-blue' :
                      groupSomeSelected ? 'bg-accent-blue/30 border-accent-blue' :
                                          'border-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {groupAllSelected  && <span className="text-white text-[9px] font-bold leading-none">✓</span>}
                    {groupSomeSelected && <span className="text-accent-blue text-[9px] font-bold leading-none">−</span>}
                  </button>

                  {/* Info del grupo */}
                  <button
                    onClick={() => txs.length > 1 && toggleExpand(asset)}
                    className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                  >
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      assetAssignedCount === txs.length ? 'bg-accent-green' :
                      assetAssignedCount > 0           ? 'bg-accent-amber' : 'bg-gray-600'
                    }`} />
                    <span className="font-bold mono">{asset}</span>
                    <span className="text-xs text-gray-500">
                      {txs.length} retiro{txs.length !== 1 ? 's' : ''} · {fmtAmt(totalAmt)} · desde {firstDate}
                    </span>
                    {/* Estado del grupo */}
                    {status.label && (
                      <span className={`text-xs font-medium ${status.color} ml-1`}>
                        → {status.label === 'múltiples' ? 'múltiples destinos' :
                           destLabel(status.label).text}
                      </span>
                    )}
                  </button>

                  {/* Acciones de grupo: aplicar a todos + expand */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Aplicar a todo el grupo */}
                    {bulkDest && (
                      <button
                        onClick={() => applyToGroup(txs)}
                        className="text-xs text-accent-blue hover:text-accent-blue/80 font-medium transition-colors whitespace-nowrap"
                        title={`Aplicar destino seleccionado a todos los retiros de ${asset}`}
                      >
                        Aplicar al grupo
                      </button>
                    )}
                    {/* Expand/collapse — solo si hay más de 1 tx */}
                    {txs.length > 1 && (
                      <button
                        onClick={() => toggleExpand(asset)}
                        className="text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        {isOpen
                          ? <ChevronDown size={14} />
                          : <ChevronRight size={14} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Filas por transacción ───────────────────────────────── */}
                {isOpen && (
                  <div className="divide-y divide-border">
                    {txs.map((tx, i) => {
                      const key       = txKey(tx)
                      const dest      = destinations[key]
                      const dl        = destLabel(dest ?? '')
                      const isTxSel   = selected.has(key)
                      const acColor   = BINANCE_ACCOUNT_COLORS[tx.account] ?? '#6b7280'

                      return (
                        <div
                          key={i}
                          className={`flex items-center gap-3 px-4 py-3 transition-all ${
                            isTxSel ? 'bg-accent-blue/5' :
                            dest    ? 'bg-accent-green/3' : ''
                          }`}
                        >
                          {/* Checkbox individual */}
                          <button
                            onClick={() => toggleTx(key)}
                            className={`w-3.5 h-3.5 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
                              isTxSel ? 'bg-accent-blue border-accent-blue' : 'border-gray-700 hover:border-gray-500'
                            }`}
                          >
                            {isTxSel && <span className="text-white text-[8px] font-bold leading-none">✓</span>}
                          </button>

                          {/* Fecha */}
                          <div className="shrink-0 w-28">
                            <p className="text-xs mono text-gray-300">
                              {new Date(tx.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })}
                            </p>
                            <p className="text-xs mono text-gray-600">
                              {new Date(tx.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>

                          {/* Cuenta */}
                          <span className="shrink-0 text-xs px-2 py-0.5 rounded-lg font-medium"
                            style={{ backgroundColor: `${acColor}18`, color: acColor }}>
                            {tx.account}
                          </span>

                          {/* Importe */}
                          <span className="font-bold mono text-accent-red text-sm shrink-0">
                            −{fmtAmt(tx.amountNet)} <span className="text-gray-500 font-normal text-xs">{tx.asset}</span>
                          </span>

                          {/* Spacer */}
                          <div className="flex-1" />

                          {/* Selector individual */}
                          <WithdrawalSelector
                            value={dest ?? ''}
                            coldWallets={coldWallets}
                            onChange={v => onAssign(key, v)}
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Depósitos externos agrupados por activo */}
        {deposits.length > 0 && (
          <DepositSection
            deposits={deposits}
            depositCosts={depositCosts}
            onSetCost={onSetDepositCost}
            allReviewed={allDepositsReviewed}
            reviewedCount={depositsReviewedCount}
          />
        )}

      </div>
    </div>
  )
}

function PreviewStage({ preview, showTxTable, setShowTxTable, txPage, setTxPage, txPageSize, resolvedOps, withdrawalDestinations, depositCosts, onWithdrawalDestination, onDepositCost, onIgnoreOp, onCatalog, onConfirm }: {
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

  // Retiros detectados en el preview
  const withdrawals = [...preview.transactions.filter(tx => tx.operationType === 'WITHDRAW')]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  // withdrawalDestinations está keyed por txKey (rawRowHashes[0]), NO por asset
  const withdrawalTxKeys = withdrawals.map(tx =>
    tx.rawRowHashes?.[0] ?? `${tx.timestamp}|${tx.asset}|${tx.amount}`
  )
  const hasUnassignedWithdrawals = withdrawalTxKeys.some(k => !withdrawalDestinations[k])

  // Depósitos externos del CSV que necesitan coste
  const depositsForPanel: DepositReview[] = preview.transactions
    .filter(tx => (tx.notes ?? '').includes('cripto externo'))
    .map(tx => ({
      txKey:          tx.rawRowHashes?.[0] ?? `${tx.timestamp}|${tx.asset}|${tx.amount}`,
      timestamp:      tx.timestamp,
      asset:          tx.asset,
      amount:         tx.amount,
      historicalPrice: null,
    }))
  const allDepositsReviewedInPanel = depositsForPanel.length === 0 ||
    depositsForPanel.every(d => d.txKey in depositCosts)

  // Bloqueado solo si hay cosas sin resolver — nunca por "nada nuevo que importar" si hay depósitos que actualizar
  const hasAnythingToDo = preview.newCount > 0 || depositsForPanel.length > 0
  const isBlocked = hasUnresolved || hasUnassignedWithdrawals || !allDepositsReviewedInPanel || !hasAnythingToDo
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
            <h2 className="font-medium text-sm">Operaciones desconocidas</h2>
          </div>
          <p className="text-xs text-gray-500">
            Cataloga cada operación para incluirla en el cálculo fiscal, o ignórala para excluirla del import.
          </p>
          <div className="space-y-2">
            {preview.validation.unknownOperations.map(op => {
              const resolved = resolvedOps[op]
              const isIgnored = resolved?.operationTypeId === 'IGNORED'
              const sample = preview.unknownOperationSamples?.[op]
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
                      {isIgnored && (
                        <span className="text-xs text-gray-600 shrink-0">Ignorada</span>
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
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Ignorar — excluye del import */}
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
                    {/* Catalogar — abre el wizard */}
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
                          <AccountChip account={tx.account} />
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

      {/* Panel unificado: retiros + depósitos externos */}
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

function ProgressStage({ log, done, onGoToDashboard }: {
  log: ProgressEvent[]
  done: boolean
  onGoToDashboard: () => void
}) {
  const [showLog, setShowLog] = useState(false)

  const PHASES = [
    { key: 'importing', label: 'Importando',    icon: FileText   },
    { key: 'prices',   label: 'Precios hist.',  icon: RefreshCw  },
    { key: 'fifo',     label: 'Cálculo FIFO',   icon: HardDrive  },
    { key: 'done',     label: 'Completado',     icon: CheckCircle },
  ] as const

  const isError = log.some(e => e.phase === 'error')
  const currentPhase = log.length > 0 ? log[log.length - 1].phase : 'importing'
  const phaseOrder = PHASES.map(p => p.key)
  const currentIdx = phaseOrder.indexOf(currentPhase as typeof phaseOrder[number])

  // Extraer métricas del log para la pantalla de éxito
  const importLine = log.find(e => e.message.includes('transacciones nuevas'))
  const fifoLine   = log.find(e => e.message.includes('lotes') && e.message.includes('consumos'))
  const gpLine     = log.find(e => e.message.includes('G/P neto'))

  return (
    <div className="card space-y-6">
      {/* Fases visuales */}
      <div className="grid grid-cols-4 gap-2">
        {PHASES.map((phase, i) => {
          const idx        = phaseOrder.indexOf(phase.key)
          const isDone     = done ? true : idx < currentIdx
          const isCurrent  = !done && phase.key === currentPhase
          const Icon       = phase.icon

          return (
            <div
              key={phase.key}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                isError && isCurrent ? 'border-accent-red/40 bg-accent-red/5' :
                isDone  ? 'border-accent-green/30 bg-accent-green/5' :
                isCurrent ? 'border-accent-blue/40 bg-accent-blue/5' :
                'border-border bg-background-tertiary/30'
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                isError && isCurrent ? 'bg-accent-red/15' :
                isDone  ? 'bg-accent-green/15' :
                isCurrent ? 'bg-accent-blue/15' :
                'bg-background-tertiary'
              }`}>
                {isCurrent && !isError
                  ? <RefreshCw size={15} className="text-accent-blue animate-spin" />
                  : <Icon size={15} className={
                      isError && isCurrent ? 'text-accent-red' :
                      isDone ? 'text-accent-green' :
                      isCurrent ? 'text-accent-blue' : 'text-gray-600'
                    } />
                }
              </div>
              <span className={`text-xs font-medium text-center leading-tight ${
                isError && isCurrent ? 'text-accent-red' :
                isDone ? 'text-accent-green' :
                isCurrent ? 'text-accent-blue' : 'text-gray-600'
              }`}>
                {phase.label}
              </span>
              {/* Barra bajo el icono */}
              <div className="w-full h-0.5 rounded-full overflow-hidden bg-background-tertiary">
                <div className={`h-full rounded-full transition-all duration-500 ${
                  isError && isCurrent ? 'bg-accent-red w-full' :
                  isDone ? 'bg-accent-green w-full' :
                  isCurrent ? 'bg-accent-blue w-1/2 animate-pulse' : 'w-0'
                }`} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Estado actual — solo cuando no ha terminado */}
      {!done && !isError && (
        <div className="flex items-center gap-3 p-3 bg-background-tertiary rounded-xl">
          <RefreshCw size={14} className="text-accent-blue animate-spin shrink-0" />
          <span className="text-sm text-gray-300">
            {log.length > 0 ? log[log.length - 1].message : 'Iniciando...'}
          </span>
          {log[log.length - 1]?.progress !== undefined && (
            <span className="ml-auto text-xs text-gray-500 mono">
              {log[log.length - 1].progress}/{log[log.length - 1].total}
            </span>
          )}
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex items-start gap-3 p-4 bg-accent-red/5 border border-accent-red/30 rounded-xl">
          <AlertTriangle size={16} className="text-accent-red shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-accent-red mb-1">Error durante la importación</p>
            <p className="text-xs text-gray-400">
              {log.find(e => e.phase === 'error')?.message ?? 'Error desconocido'}
            </p>
          </div>
        </div>
      )}

      {/* Resumen de éxito */}
      {done && !isError && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle size={18} className="text-accent-green" />
            <span className="font-semibold text-accent-green">Importación completada</span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {importLine && (
              <div className="bg-background-tertiary rounded-xl p-3 text-center">
                <p className="text-xl font-bold mono text-white">
                  {importLine.message.match(/(\d+) transacciones/)?.[1] ?? '—'}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">Transacciones nuevas</p>
              </div>
            )}
            {fifoLine && (
              <>
                <div className="bg-background-tertiary rounded-xl p-3 text-center">
                  <p className="text-xl font-bold mono text-white">
                    {fifoLine.message.match(/(\d+) lotes/)?.[1] ?? '—'}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Lotes FIFO</p>
                </div>
                <div className="bg-background-tertiary rounded-xl p-3 text-center">
                  <p className="text-xl font-bold mono text-white">
                    {fifoLine.message.match(/(\d+) consumos/)?.[1] ?? '—'}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Consumos</p>
                </div>
              </>
            )}
          </div>

          {gpLine && (
            <div className={`flex items-center justify-between p-3 rounded-xl border ${
              (gpLine.message.includes('+') && !gpLine.message.startsWith('G/P neto: -'))
                ? 'bg-accent-green/5 border-accent-green/20'
                : 'bg-accent-red/5 border-accent-red/20'
            }`}>
              <span className="text-sm text-gray-400">G/P neto acumulado</span>
              <span className={`font-bold mono ${
                gpLine.message.includes('+') ? 'text-accent-green' : 'text-accent-red'
              }`}>
                {gpLine.message.replace('G/P neto: ', '')}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setShowLog(v => !v)}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1.5"
            >
              <ChevronDown size={12} className={`transition-transform ${showLog ? 'rotate-180' : ''}`} />
              {showLog ? 'Ocultar' : 'Ver'} log técnico
            </button>
            <button
              onClick={onGoToDashboard}
              className="flex items-center gap-2 px-5 py-2 bg-accent-blue hover:bg-accent-blue/80 rounded-lg text-sm font-medium transition-colors"
            >
              Ver Dashboard
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Log técnico colapsable */}
      {(showLog || (!done && log.length > 3)) && (
        <div className="bg-black/50 rounded-lg p-4 font-mono text-xs space-y-1 max-h-48 overflow-y-auto">
          {log.map((event, i) => (
            <div key={i} className={
              event.phase === 'error' ? 'text-accent-red' :
              event.phase === 'done'  ? 'text-accent-green' :
              event.phase === 'fifo'  ? 'text-accent-blue' :
              'text-gray-500'
            }>
              {event.progress !== undefined && event.total !== undefined
                ? `[${event.progress}/${event.total}] ${event.message}`
                : event.message
              }
            </div>
          ))}
          {!done && <div className="text-accent-blue animate-pulse">▍</div>}
        </div>
      )}
    </div>
  )
}

function ImportsList({ imports, onDelete }: {
  imports: ImportRecord[]
  onDelete: (id: string) => void
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const confirmTarget = imports.find(i => i.id === confirmId)

  const totalTx = imports.reduce((s, i) => s + parseInt(i.transaction_count), 0)

  async function handleConfirmDelete() {
    if (!confirmId) return
    setDeletingId(confirmId)
    setConfirmId(null)
    await onDelete(confirmId)
    setDeletingId(null)
  }

  return (
    <>
      <div className="space-y-2">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-medium text-gray-400">
            Historial de importaciones
          </h3>
          <span className="text-xs text-gray-600">
            {imports.length} archivo{imports.length !== 1 ? 's' : ''} · {totalTx} transacciones totales
          </span>
        </div>

        {/* Cards */}
        {imports.map(imp => {
          const txCount     = parseInt(imp.transaction_count)
          const buyCount    = parseInt(imp.buy_count)
          const sellCount   = parseInt(imp.sell_count ?? '0')
          const withdrawCount = parseInt(imp.withdraw_count)
          const dateFrom = imp.date_from ? new Date(imp.date_from) : null
          const dateTo   = imp.date_to   ? new Date(imp.date_to)   : null
          const isDeleting = deletingId === imp.id

          const fmtDate = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })

          return (
            <div
              key={imp.id}
              className={`rounded-xl border border-border bg-background-card transition-opacity ${isDeleting ? 'opacity-40 pointer-events-none' : ''}`}
            >
              {/* Fila principal */}
              <div className="px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-background-tertiary flex items-center justify-center shrink-0">
                  <FileText size={16} className="text-gray-500" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{imp.filename}</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {new Date(imp.imported_at).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>

                {/* Rango de fechas */}
                {dateFrom && dateTo && (
                  <div className="text-xs text-gray-500 mono text-right shrink-0 hidden sm:block">
                    <p>{fmtDate(dateFrom)}</p>
                    <p className="text-gray-700">→ {fmtDate(dateTo)}</p>
                  </div>
                )}

                {/* Borrar */}
                <button
                  onClick={() => setConfirmId(imp.id)}
                  className="p-1.5 text-gray-600 hover:text-accent-red hover:bg-accent-red/10 rounded-lg transition-colors shrink-0"
                >
                  {isDeleting
                    ? <RefreshCw size={14} className="animate-spin" />
                    : <Trash2 size={14} />
                  }
                </button>
              </div>

              {/* Stats chips */}
              {txCount > 0 && (
                <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-md bg-background-tertiary text-gray-400">
                    {txCount} transacciones
                  </span>
                  {buyCount > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-md bg-accent-green/10 text-accent-green">
                      {buyCount} compras
                    </span>
                  )}
                  {sellCount > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-md bg-accent-red/10 text-accent-red">
                      {sellCount} ventas
                    </span>
                  )}
                  {withdrawCount > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-md bg-accent-amber/10 text-accent-amber">
                      {withdrawCount} retiradas
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {confirmTarget && (
        <ConfirmDialog
          title="Borrar importación"
          message={`Borrar "${confirmTarget.filename}"? Se eliminarán todas sus transacciones y se recalculará el FIFO. Esta acción no se puede deshacer.`}
          confirmLabel="Borrar"
          danger
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </>
  )
}

// ── PendingDepositsPanel ───────────────────────────────────────────────────
type PendingDeposit = { id: string; timestamp: string; asset: string; amount: string; wallet_name: string; historicalPrice: number | null }

function PendingDepositsPanel({ deposits }: { deposits: PendingDeposit[] }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [localCosts, setLocalCosts] = useState<Record<string, number | null>>({})
  const [saving, setSaving] = useState(false)

  // Cuántos tienen precio asignado (manual o null=desconocido marcado)
  const reviewed = deposits.filter(d => d.id in localCosts)
  const allReviewed = reviewed.length === deposits.length
  const hasValues = deposits.some(d => localCosts[d.id] != null)

  async function handleSave() {
    const updates = deposits
      .filter(d => localCosts[d.id] != null)
      .map(d => ({ id: d.id, pricePerUnit: localCosts[d.id] as number }))

    setSaving(true)
    try {
      if (updates.length > 0) {
        await portfolioApi.bulkSetCosts(updates)
      }
      queryClient.invalidateQueries({ queryKey: ['pending-deposits'] })
      queryClient.invalidateQueries({ queryKey: ['fifo-lots'] })
      queryClient.invalidateQueries({ queryKey: ['fiscal-summary'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      const skipped = deposits.length - updates.length
      toast.success(
        'Revisión completada',
        `${updates.length > 0 ? `${updates.length} coste${updates.length > 1 ? 's' : ''} guardado${updates.length > 1 ? 's' : ''}` : ''}${skipped > 0 ? ` · ${skipped} marcado${skipped > 1 ? 's' : ''} como desconocido` : ''}`
      )
      setLocalCosts({})
    } catch (e) {
      toast.error('Error al guardar', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card border-accent-amber/40 bg-amber-950/20">
      {/* Header */}
      <div className="flex items-start gap-3 mb-5">
        <div className="w-8 h-8 rounded-xl bg-accent-amber/15 flex items-center justify-center shrink-0">
          <AlertTriangle size={16} className="text-accent-amber" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm text-white">
            Revisión obligatoria — depósitos sin coste de adquisición
          </h3>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">
            {deposits.length} depósito{deposits.length > 1 ? 's' : ''} recibido{deposits.length > 1 ? 's' : ''} desde fuera de Binance
            {deposits.length > 1 ? ' no tienen' : ' no tiene'} precio de adquisición registrado.
            Esto afecta al cálculo FIFO y a tu declaración fiscal.
            <strong className="text-accent-amber"> Debes revisar todos para poder importar nuevos datos.</strong>
          </p>
          {/* Progreso */}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 bg-background-tertiary rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-amber transition-all duration-300 rounded-full"
                style={{ width: `${(reviewed.length / deposits.length) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 shrink-0">{reviewed.length}/{deposits.length} revisados</span>
          </div>
        </div>
      </div>

      {/* Lista de depósitos */}
      <div className="space-y-2 mb-4">
        {deposits.map(dep => {
          const cost = localCosts[dep.id]
          const isReviewed = dep.id in localCosts
          const date = new Date(dep.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
          const amount = parseFloat(dep.amount)

          return (
            <div
              key={dep.id}
              className={`p-3 rounded-xl border transition-colors ${
                isReviewed
                  ? cost != null
                    ? 'border-accent-green/30 bg-accent-green/5'
                    : 'border-gray-600 bg-background-tertiary'
                  : 'border-accent-amber/20 bg-background-card'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-bold mono text-sm text-white">{dep.asset}</span>
                    <span className="text-xs text-gray-400 mono">{amount.toLocaleString('es-ES', { maximumFractionDigits: 6 })}</span>
                    <span className="text-gray-600">·</span>
                    <span className="text-xs text-gray-500">{date}</span>
                    {!isReviewed && (
                      <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-accent-amber/15 text-accent-amber rounded-full font-medium">
                        Pendiente
                      </span>
                    )}
                    {isReviewed && cost != null && (
                      <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-accent-green/15 text-accent-green rounded-full font-medium flex items-center gap-0.5">
                        <Check size={9} /> {cost.toLocaleString('es-ES', { maximumFractionDigits: 4 })} €/ud.
                      </span>
                    )}
                    {isReviewed && cost == null && (
                      <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded-full font-medium">
                        Desconocido
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="Precio EUR/unidad al adquirir..."
                      value={cost != null ? cost : ''}
                      onChange={e => setLocalCosts(prev => ({
                        ...prev,
                        [dep.id]: e.target.value ? parseFloat(e.target.value) : null
                      }))}
                      className="flex-1 bg-background-primary border border-border rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent-blue transition-colors mono"
                    />
                    {dep.historicalPrice != null && (
                      <button
                        onClick={() => setLocalCosts(prev => ({ ...prev, [dep.id]: dep.historicalPrice! }))}
                        className="text-xs px-3 py-1.5 bg-accent-blue/10 hover:bg-accent-blue/20 border border-accent-blue/30 text-accent-blue rounded-lg transition-colors whitespace-nowrap"
                      >
                        {dep.historicalPrice.toLocaleString('es-ES', { maximumFractionDigits: 4 })} € (histórico)
                      </button>
                    )}
                    <button
                      onClick={() => setLocalCosts(prev => {
                        if (prev[dep.id] === null) {
                          // toggle: desmarcar si ya era "desconocido"
                          const next = { ...prev }
                          delete next[dep.id]
                          return next
                        }
                        return { ...prev, [dep.id]: null }
                      })}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
                        isReviewed && cost == null
                          ? 'bg-gray-700 border-gray-600 text-gray-300'
                          : 'bg-background-primary border-border text-gray-500 hover:border-gray-500 hover:text-gray-300'
                      }`}
                    >
                      No sé
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          {!allReviewed
            ? `Faltan ${deposits.length - reviewed.length} por revisar`
            : hasValues
            ? 'Todo revisado — guarda para continuar'
            : 'Todos marcados como desconocidos — guarda para continuar'
          }
        </p>
        <button
          onClick={handleSave}
          disabled={!allReviewed || saving}
          className="flex items-center gap-2 px-5 py-2 bg-accent-amber hover:bg-accent-amber/80 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-black transition-colors"
        >
          {saving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
          {saving ? 'Guardando...' : 'Guardar y desbloquear importación'}
        </button>
      </div>
    </div>
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