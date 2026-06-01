import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi, ImportRecord } from '../api/portfolio'
import {
  Upload, FileText, Trash2, RefreshCw, CheckCircle,
  AlertCircle, ChevronDown, ChevronUp, Eye, Play,
  AlertTriangle, Info, ArrowRight, Plus, HardDrive, X, Check
} from 'lucide-react'
import { OperationWizard, WizardResult } from '../components/OperationWizard'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ManualTxModal } from '../components/ManualTxModal'
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

  const [setupSeen, setSetupSeen] = useState(() => localStorage.getItem(SETUP_KEY) === 'true')
  const [stage, setStage] = useState<'upload' | 'preview' | 'catalog' | 'progress' | 'done'>('upload')
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [catalogingOp, setCatalogingOp] = useState<string | null>(null)
  const [resolvedOps, setResolvedOps] = useState<Record<string, WizardResult>>({})
  // asset -> walletId: destinos asignados por el usuario para cada retiro
  const [withdrawalDestinations, setWithdrawalDestinations] = useState<Record<string, string>>({})
  const [progressLog, setProgressLog] = useState<ProgressEvent[]>([])
  const [showTxTable, setShowTxTable] = useState(false)
  const [txPage, setTxPage] = useState(0)
  const [showManualTx, setShowManualTx] = useState(false)
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
    if (Object.keys(withdrawalDestinations).length > 0) {
      form.append('withdrawalDestinations', JSON.stringify(withdrawalDestinations))
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
    setWithdrawalDestinations({})
    fileBufferRef.current = null
    if (fileRef.current) fileRef.current.value = ''
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
          onWithdrawalDestination={(asset, walletId) =>
            setWithdrawalDestinations(prev => ({ ...prev, [asset]: walletId }))
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

// ── WithdrawalDestinations ─────────────────────────────────────────────────
function WithdrawalDestinations({ withdrawals, destinations, onAssign }: {
  withdrawals: PreviewTransaction[]
  destinations: Record<string, string>
  onAssign: (asset: string, walletId: string) => void
}) {
  const [applyAllWallet, setApplyAllWallet] = useState('')

  const { data: wallets = [] } = useQuery({
    queryKey: ['wallets'],
    queryFn: () => fetch('/api/wallets').then(r => r.json()),
  })
  const allNonExchangeWallets = (wallets as { id: string; name: string; type: string; color: string }[])
    .filter(w => w.type !== 'exchange')
  const coldWallets = allNonExchangeWallets.filter(w => w.name !== 'Wallets externas')

  // Ordenar por fecha, agrupar por activo
  const sortedWithdrawals = [...withdrawals].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
  const byAsset = sortedWithdrawals.reduce<Record<string, PreviewTransaction[]>>((acc, tx) => {
    if (!acc[tx.asset]) acc[tx.asset] = []
    acc[tx.asset].push(tx)
    return acc
  }, {})
  // Ordenar grupos por fecha del primer retiro de cada activo
  const uniqueAssets = Object.entries(byAsset)
    .sort((a, b) => new Date(a[1][0].timestamp).getTime() - new Date(b[1][0].timestamp).getTime())
    .map(([asset]) => asset)

  const assignedCount = uniqueAssets.filter(a => destinations[a]).length
  const totalAssets   = uniqueAssets.length
  const allAssigned   = assignedCount === totalAssets
  const progress      = totalAssets > 0 ? (assignedCount / totalAssets) * 100 : 0

  function applyToAll() {
    if (!applyAllWallet) return
    uniqueAssets.forEach(a => onAssign(a, applyAllWallet))
  }

  const fmtDate = (ts: string) => new Date(ts).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
  const fmtAmt = (n: number) => {
    if (Math.abs(n) >= 1000) return n.toLocaleString('es-ES', { maximumFractionDigits: 4 })
    if (Math.abs(n) >= 1)    return n.toFixed(6)
    return n.toFixed(8)
  }

  return (
    <div className={`rounded-2xl border-2 overflow-hidden transition-all duration-300 ${
      allAssigned ? 'border-accent-green/40' : 'border-accent-amber/40'
    }`}>
      {/* Header con progreso */}
      <div className={`px-5 py-4 ${allAssigned ? 'bg-accent-green/8' : 'bg-accent-amber/8'}`}>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold ${allAssigned ? 'text-accent-green' : 'text-accent-amber'}`}>
                {allAssigned ? '✓ Destinos de retiros completados' : 'Asigna el destino de cada retiro'}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                allAssigned ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-amber/20 text-accent-amber'
              }`}>
                {assignedCount}/{totalAssets}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              El FIFO no puede mover los lotes sin saber a qué wallet van. Obligatorio antes de importar.
            </p>
          </div>
          <span className="text-xs text-gray-600 shrink-0 pt-0.5">
            {withdrawals.length} retiro{withdrawals.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Barra de progreso */}
        <div className="h-1.5 bg-background-tertiary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${allAssigned ? 'bg-accent-green' : 'bg-accent-amber'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="p-5 space-y-5 bg-background-card">
        {coldWallets.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-accent-amber bg-accent-amber/10 rounded-xl px-4 py-3 border border-accent-amber/20">
            <AlertTriangle size={13} className="shrink-0" />
            No tienes wallets frías configuradas. Ve a Configuración → Wallets y añade tu Tangem/Ledger antes de importar.
          </div>
        ) : (
          /* Aplicar a todos */
          <div className="flex items-center gap-3 p-3 bg-background-tertiary rounded-xl border border-border">
            <span className="text-xs font-medium text-gray-400 shrink-0">Aplicar a todos:</span>
            <div className="flex-1">
              <WithdrawalSelector value={applyAllWallet} coldWallets={coldWallets} onChange={setApplyAllWallet} />
            </div>
            <button
              onClick={applyToAll}
              disabled={!applyAllWallet}
              className="shrink-0 px-4 py-1.5 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
            >
              Aplicar
            </button>
          </div>
        )}

        {/* Grupos por activo ordenados por fecha */}
        <div className="space-y-5">
          {uniqueAssets.map(asset => {
            const txs        = byAsset[asset]
            const assigned   = destinations[asset]
            const destWallet = coldWallets.find(w => w.id === assigned)
            const totalAmt   = txs.reduce((s, t) => s + t.amountNet, 0)
            const firstDate  = new Date(txs[0].timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })

            return (
              <div key={asset}>
                {/* Cabecera del grupo */}
                <div className="flex items-center justify-between gap-3 mb-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${assigned ? 'bg-accent-green' : 'bg-accent-amber'}`} />
                    <span className="font-bold mono text-base">{asset}</span>
                    <div className="text-xs text-gray-500 hidden sm:flex items-center gap-1">
                      <span>{txs.length} retiro{txs.length !== 1 ? 's' : ''}</span>
                      <span className="text-gray-700">·</span>
                      <span className="mono">{fmtAmt(totalAmt)}</span>
                      <span className="text-gray-700">·</span>
                      <span>desde {firstDate}</span>
                    </div>
                  </div>
                  <WithdrawalSelector
                    value={assigned ?? ''}
                    coldWallets={coldWallets}
                    onChange={v => onAssign(asset, v)}
                  />
                </div>

                {/* Tarjetas de transacciones */}
                <div className="space-y-1.5">
                  {txs.map((tx, i) => {
                    const acColor = BINANCE_ACCOUNT_COLORS[tx.account] ?? '#6b7280'
                    return (
                      <div
                        key={i}
                        className={`rounded-xl border px-4 py-3 flex items-center gap-4 transition-all ${
                          assigned
                            ? 'border-accent-green/20 bg-accent-green/4'
                            : 'border-border bg-background-tertiary/50'
                        }`}
                      >
                        {/* Fecha */}
                        <div className="shrink-0 w-32">
                          <p className="text-xs mono text-gray-300 font-medium">
                            {new Date(tx.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })}
                          </p>
                          <p className="text-xs mono text-gray-600">
                            {new Date(tx.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>

                        {/* Cuenta */}
                        <span
                          className="shrink-0 text-xs px-2 py-0.5 rounded-lg font-medium"
                          style={{ backgroundColor: `${acColor}18`, color: acColor }}
                        >
                          {tx.account}
                        </span>

                        {/* Importe */}
                        <div className="flex-1 flex items-center gap-1.5">
                          <span className="font-bold mono text-accent-red text-sm">
                            −{fmtAmt(tx.amountNet)}
                          </span>
                          <span className="text-gray-500 mono text-xs">{tx.asset}</span>
                        </div>

                        {/* Notas */}
                        {tx.notes && (
                          <span className="hidden lg:block text-xs text-gray-700 truncate max-w-40">
                            {tx.notes}
                          </span>
                        )}

                        {/* Destino */}
                        <div className="shrink-0 flex items-center gap-1.5">
                          {assigned === '__lost__' ? (
                            <span className="text-xs font-medium text-accent-red">💀 Pérdida patrimonial</span>
                          ) : assigned === '__gift__' ? (
                            <span className="text-xs font-medium text-accent-blue">🎁 Regalo/Pago — venta a mercado</span>
                          ) : assigned === '__external__' ? (
                            <span className="text-xs font-medium text-gray-400">📱 Mi wallet externa</span>
                          ) : destWallet ? (
                            <>
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: destWallet.color }} />
                              <span className="text-xs font-medium text-accent-green">{destWallet.name}</span>
                            </>
                          ) : (
                            <span className="text-xs text-gray-600 italic">pendiente</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function PreviewStage({ preview, showTxTable, setShowTxTable, txPage, setTxPage, txPageSize, resolvedOps, withdrawalDestinations, onWithdrawalDestination, onCatalog, onConfirm }: {
  preview: PreviewResult
  showTxTable: boolean
  setShowTxTable: (v: boolean) => void
  txPage: number
  setTxPage: (v: number) => void
  txPageSize: number
  resolvedOps: Record<string, WizardResult>
  withdrawalDestinations: Record<string, string>
  onWithdrawalDestination: (asset: string, walletId: string) => void
  onCatalog: (op: string) => void
  onConfirm: () => void
}) {
  const hasUnresolved = preview.validation.unknownOperations.some(op => !resolvedOps[op] || resolvedOps[op].operationTypeId === '')

  // Retiros detectados en el preview (transacciones completas, ordenados por fecha)
  const withdrawals = [...preview.transactions.filter(tx => tx.operationType === 'WITHDRAW')]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  const withdrawalAssets = [...new Set(withdrawals.map(tx => tx.asset))]
  const hasUnassignedWithdrawals = withdrawalAssets.length > 0 &&
    withdrawalAssets.some(a => !withdrawalDestinations[a])
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
                      onClick={() => setResolvedOps(prev => ({
                        ...prev,
                        [op]: { operationTypeId: 'IGNORED', fields: {} }
                      }))}
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

      {/* Sección de asignación de destino para retiros */}
      {withdrawals.length > 0 && (
        <WithdrawalDestinations
          withdrawals={withdrawals}
          destinations={withdrawalDestinations}
          onAssign={onWithdrawalDestination}
        />
      )}

      <div className="flex items-center justify-between pt-2">
        <div className="text-xs text-gray-500">
          {hasUnresolved
            ? '⚠ Resuelve todas las operaciones desconocidas antes de confirmar'
            : hasUnassignedWithdrawals
            ? '⚠ Asigna el destino de todos los retiros antes de confirmar'
            : preview.newCount === 0
            ? 'No hay transacciones nuevas que importar'
            : `Se importarán ${preview.newCount} transacciones y se recalculará el FIFO automáticamente`
          }
        </div>
        <button
          onClick={onConfirm}
          disabled={hasUnresolved || hasUnassignedWithdrawals || preview.newCount === 0}
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