import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi, AssetMetadata } from '../../api/portfolio'
import {
  Search, Plus, RefreshCw, CheckCircle, XCircle, AlertCircle,
  Edit2, Zap, Trash2, ChevronDown, X, ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { usePricesStore } from '../../store/pricesStore'

const SOURCE_META: Record<string, { label: string; color: string }> = {
  eur_direct: { label: 'EUR directo', color: '#00c896' },
  usdt_proxy: { label: 'Vía USDT',    color: '#6366f1' },
  btc_proxy:  { label: 'Vía BTC',     color: '#f59e0b' },
  coingecko:  { label: 'CoinGecko',   color: '#8b5cf6' },
  fiat:       { label: 'Estable',      color: '#6b7280' },
  unknown:    { label: 'Sin precio',   color: '#e74c3c' },
}

function fmtPrice(p: number): string {
  if (p >= 10000)   return `€${p.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (p >= 1)       return `€${p.toFixed(4)}`
  if (p >= 0.001)   return `€${p.toFixed(6)}`
  if (p >= 0.00001) return `€${p.toFixed(8)}`
  return `€${p.toExponential(4)}`
}

type SortKey = 'name' | 'price' | 'source'
type SortDir = 'asc' | 'desc'

function SortButton({ label, sortKey, active, dir, onClick }: {
  label: string; sortKey: SortKey; active: SortKey; dir: SortDir; onClick: (k: SortKey) => void
}) {
  const isActive = active === sortKey
  return (
    <button onClick={() => onClick(sortKey)}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
        isActive ? 'bg-accent-blue/15 text-accent-blue' : 'text-gray-500 hover:text-gray-300 hover:bg-background-tertiary'
      }`}>
      {label}
      {isActive
        ? dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
        : <ArrowUpDown size={11} className="opacity-40" />
      }
    </button>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-3 group w-fit">
      <div className={`relative w-9 h-5 rounded-full transition-all duration-200 shrink-0 ${
        checked ? 'bg-accent-blue' : 'bg-background-tertiary border border-border group-hover:border-gray-500'
      }`}>
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-4 bg-white' : 'bg-gray-500 group-hover:bg-gray-400'
        }`} />
      </div>
      <span className={`text-xs transition-colors ${checked ? 'text-white' : 'text-gray-500 group-hover:text-gray-400'}`}>
        {label}
      </span>
    </button>
  )
}

// ── CoinGeckoIdEditor ──────────────────────────────────────────────────────
function CoinGeckoIdEditor({ asset, onSaved }: { asset: AssetMetadata; onSaved: () => void }) {
  const queryClient = useQueryClient()
  const [geckoId,    setGeckoId]    = useState(asset.coingecko_id ?? '')
  const [testing,    setTesting]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [testResult, setTestResult] = useState<{ valid: boolean; price_eur: number | null } | null>(null)
  const [error,      setError]      = useState<string | null>(null)

  const isDirty = geckoId.trim() !== (asset.coingecko_id ?? '')

  async function handleTest() {
    if (!geckoId.trim()) return
    setTesting(true)
    setTestResult(null)
    setError(null)
    try {
      const result = await portfolioApi.testCoinGeckoId(geckoId.trim())
      setTestResult(result)
    } catch { setError('Error al conectar con CoinGecko') }
    finally { setTesting(false) }
  }

  async function handleSave() {
    if (!geckoId.trim()) return
    setSaving(true)
    setError(null)
    try {
      await portfolioApi.updateCoinGeckoId(asset.symbol, geckoId.trim())
      queryClient.invalidateQueries({ queryKey: ['assets'] })
      onSaved()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al guardar'
      setError(msg.includes('422') ? `"${geckoId}" no devuelve precio en CoinGecko` : msg)
    } finally { setSaving(false) }
  }

  return (
    <div className="pt-3 border-t border-border/50 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-600">ID de CoinGecko</p>
        <a href={`https://www.coingecko.com/es/buscar?query=${asset.symbol}`}
          target="_blank" rel="noopener noreferrer"
          className="text-xs text-accent-blue/70 hover:text-accent-blue transition-colors">
          Buscar en CoinGecko ↗
        </a>
      </div>
      <p className="text-xs text-gray-700">
        Visible en la URL: <span className="mono">coingecko.com/coins/<span className="text-gray-500">bitcoin</span></span>
      </p>
      <div className="flex gap-2">
        <input
          value={geckoId}
          onChange={e => { setGeckoId(e.target.value.toLowerCase().trim()); setTestResult(null); setError(null) }}
          onKeyDown={e => e.key === 'Enter' && handleTest()}
          placeholder="ej. bitcoin, ethereum, ethereumpow"
          className="flex-1 bg-background-tertiary border border-border rounded-lg px-3 py-2 text-sm mono placeholder-gray-600 focus:outline-none focus:border-accent-blue"
        />
        <button onClick={handleTest} disabled={testing || !geckoId.trim()}
          title="Verificar que este ID devuelve precio en CoinGecko"
          className="px-3 py-2 bg-background-tertiary hover:bg-border disabled:opacity-50 rounded-lg text-sm transition-colors">
          {testing ? <RefreshCw size={13} className="animate-spin" /> : <Search size={13} />}
        </button>
        {isDirty && (
          <button onClick={handleSave} disabled={saving || !geckoId.trim()}
            className="px-3 py-2 bg-accent-blue/20 hover:bg-accent-blue/30 disabled:opacity-50 rounded-lg text-xs font-medium text-accent-blue transition-colors whitespace-nowrap">
            {saving ? <RefreshCw size={12} className="animate-spin" /> : 'Guardar'}
          </button>
        )}
      </div>
      {testResult && (
        <div className={`flex items-center gap-2 text-xs ${testResult.valid ? 'text-accent-green' : 'text-accent-red'}`}>
          {testResult.valid
            ? <><CheckCircle size={12} /> Válido — precio actual: <span className="mono font-medium">{testResult.price_eur?.toFixed(6)} EUR</span></>
            : <><XCircle size={12} /> Este ID no devuelve precio en CoinGecko</>
          }
        </div>
      )}
      {error && <p className="flex items-center gap-1.5 text-xs text-accent-red"><AlertCircle size={12} />{error}</p>}
    </div>
  )
}

// ── AssetEditPanel ─────────────────────────────────────────────────────────
function AssetEditPanel({ asset, onSaved, onCancel }: {
  asset: AssetMetadata; onSaved: () => void; onCancel: () => void
}) {
  const queryClient = useQueryClient()
  const [eurPair,     setEurPair]     = useState(asset.binance_eur_pair  ?? '')
  const [usdtPair,    setUsdtPair]    = useState(asset.binance_usdt_pair ?? '')
  const [btcPair,     setBtcPair]     = useState(asset.binance_btc_pair  ?? '')
  const [isStable,    setIsStable]    = useState(asset.is_stablecoin)
  const [detecting,   setDetecting]   = useState(false)
  const [detectRan,   setDetectRan]   = useState(false)
  const [testPairVal, setTestPairVal] = useState('')
  const [testResult,  setTestResult]  = useState<{ exists: boolean; price?: number } | null>(null)
  const [testLoading, setTestLoading] = useState(false)
  const [saving,      setSaving]      = useState(false)

  const inputClass = "w-full bg-background-tertiary border border-border rounded-lg px-3 py-2 text-sm mono placeholder-gray-600 focus:outline-none focus:border-accent-blue"

  async function handleDetect() {
    setDetecting(true)
    try {
      const result = await portfolioApi.detectPairs(asset.symbol)
      setEurPair(result.binance_eur_pair  ?? '')
      setUsdtPair(result.binance_usdt_pair ?? '')
      setBtcPair(result.binance_btc_pair  ?? '')
      setDetectRan(true)
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    } finally { setDetecting(false) }
  }

  async function handleTest() {
    if (!testPairVal) return
    setTestLoading(true)
    setTestResult(null)
    const result = await portfolioApi.testPair(testPairVal)
    setTestResult(result)
    setTestLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    await portfolioApi.updateAsset(asset.symbol, {
      binance_eur_pair:  eurPair  || null,
      binance_usdt_pair: usdtPair || null,
      binance_btc_pair:  btcPair  || null,
      is_stablecoin:     isStable,
    } as Partial<AssetMetadata>)
    setSaving(false)
    onSaved()
  }

  const isCoinGeckoSource = asset.price_source === 'coingecko'

  return (
    <div className="border-t border-border bg-background-tertiary/20 px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-400">Editar pares — <span className="mono">{asset.symbol}</span></p>
        <button onClick={handleDetect} disabled={detecting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
          style={{ backgroundColor: '#6366f118', color: '#6366f1' }}>
          {detecting ? <RefreshCw size={11} className="animate-spin" /> : <Zap size={11} />}
          Auto-detectar
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {([
          { label: 'Par EUR',  val: eurPair,  set: setEurPair,  ph: `${asset.symbol}EUR`  },
          { label: 'Par USDT', val: usdtPair, set: setUsdtPair, ph: `${asset.symbol}USDT` },
          { label: 'Par BTC',  val: btcPair,  set: setBtcPair,  ph: `${asset.symbol}BTC`  },
        ] as const).map(({ label, val, set, ph }) => (
          <div key={label} className="space-y-1">
            <label className="text-xs text-gray-500">{label}</label>
            <input value={val} onChange={e => set(e.target.value.toUpperCase())} placeholder={ph} className={inputClass} />
            {detectRan && !val && (
              <p className="flex items-center gap-1 text-xs text-gray-600">
                <XCircle size={10} /> No disponible
              </p>
            )}
          </div>
        ))}
      </div>

      <Toggle checked={isStable} onChange={setIsStable} label="Stablecoin o fiat (sin par de precio)" />

      <div className="pt-2 border-t border-border/50 space-y-2">
        <p className="text-xs text-gray-600">Probar par en Binance</p>
        <div className="flex gap-2">
          <input value={testPairVal} onChange={e => setTestPairVal(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleTest()}
            placeholder={`${asset.symbol}EUR, ${asset.symbol}USDT...`}
            className="flex-1 bg-background-tertiary border border-border rounded-lg px-3 py-2 text-sm mono placeholder-gray-600 focus:outline-none focus:border-accent-blue" />
          <button onClick={handleTest} disabled={testLoading || !testPairVal}
            className="px-3 py-2 bg-background-tertiary hover:bg-border disabled:opacity-50 rounded-lg text-sm transition-colors">
            {testLoading ? <RefreshCw size={13} className="animate-spin" /> : <Search size={13} />}
          </button>
        </div>
        {testResult && (
          <div className={`flex items-center gap-2 text-xs ${testResult.exists ? 'text-accent-green' : 'text-accent-red'}`}>
            {testResult.exists
              ? <><CheckCircle size={12} /> Existe — precio: <span className="mono font-medium">{testResult.price?.toFixed(6)} EUR</span></>
              : <><XCircle size={12} /> Par no encontrado en Binance</>
            }
          </div>
        )}
      </div>

      {isCoinGeckoSource && <CoinGeckoIdEditor asset={asset} onSaved={onSaved} />}

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-1.5 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors">
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

// ── AssetItem ──────────────────────────────────────────────────────────────
function AssetItem({ asset, price, isEditing, onEdit, onSaved, onDelete }: {
  asset: AssetMetadata; price: number | undefined
  isEditing: boolean; onEdit: () => void; onSaved: () => void; onDelete: () => void
}) {
  const src = SOURCE_META[asset.price_source] ?? SOURCE_META.unknown
  const activePair = asset.binance_eur_pair ?? asset.binance_usdt_pair ?? asset.binance_btc_pair

  return (
    <div className="rounded-xl border border-border bg-background-card" style={{ borderLeftColor: src.color, borderLeftWidth: 3 }}>
      <div className="group flex items-center gap-4 px-4 py-3">
        <div className="w-28 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold mono">{asset.symbol}</span>
            {asset.auto_detected && <span className="text-xs" style={{ color: '#6366f1' }}>auto</span>}
          </div>
          <div className="text-xs text-gray-600 truncate">{asset.name}</div>
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs px-2 py-0.5 rounded-md font-medium shrink-0"
            style={{ backgroundColor: `${src.color}18`, color: src.color }}>
            {src.label}
          </span>
          {activePair && <span className="text-xs mono text-gray-500 truncate">{activePair}</span>}
        </div>
        <div className="w-28 text-right shrink-0">
          {price != null
            ? <span className="text-sm font-medium mono">{fmtPrice(price)}</span>
            : <span className="text-xs text-gray-700">—</span>
          }
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={onEdit} className="p-1.5 text-gray-600 hover:text-white hover:bg-background-tertiary rounded-lg transition-colors">
            <Edit2 size={12} />
          </button>
          <button onClick={onDelete} className="p-1.5 text-gray-600 hover:text-accent-red hover:bg-accent-red/10 rounded-lg transition-colors">
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      {isEditing && <AssetEditPanel asset={asset} onSaved={onSaved} onCancel={onEdit} />}
    </div>
  )
}

// ── AddAssetDialog ─────────────────────────────────────────────────────────
type DetectStatus = 'idle' | 'detecting' | 'found_binance' | 'found_coingecko' | 'notfound'

function AddAssetDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [symbol,     setSymbol]     = useState('')
  const [name,       setName]       = useState('')
  const [eurPair,    setEurPair]    = useState('')
  const [usdtPair,   setUsdtPair]   = useState('')
  const [btcPair,    setBtcPair]    = useState('')
  const [geckoId,    setGeckoId]    = useState<string | null>(null)
  const [isStable,   setIsStable]   = useState(false)
  const [status,     setStatus]     = useState<DetectStatus>('idle')
  const [saving,     setSaving]     = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const inputClass = "w-full bg-background-tertiary border border-border rounded-lg px-3 py-2 text-sm mono placeholder-gray-600 focus:outline-none focus:border-accent-blue"

  useEffect(() => {
    const sym = symbol.trim()
    if (sym.length < 2) {
      setStatus('idle')
      setEurPair(''); setUsdtPair(''); setBtcPair(''); setGeckoId(null)
      return
    }
    clearTimeout(debounceRef.current)
    setStatus('detecting')
    debounceRef.current = setTimeout(async () => {
      try {
        // 1. Buscar en Binance
        const [eur, usdt, btc] = await Promise.all([
          portfolioApi.testPair(`${sym}EUR`),
          portfolioApi.testPair(`${sym}USDT`),
          portfolioApi.testPair(`${sym}BTC`),
        ])
        if (eur.exists || usdt.exists || btc.exists) {
          setEurPair(eur.exists  ? `${sym}EUR`  : '')
          setUsdtPair(usdt.exists ? `${sym}USDT` : '')
          setBtcPair(btc.exists  ? `${sym}BTC`  : '')
          setGeckoId(null)
          setStatus('found_binance')
          return
        }

        // 2. Fallback a CoinGecko
        const cg = await portfolioApi.searchCoinGecko(sym)
        if (cg.found && cg.coingecko_id) {
          setGeckoId(cg.coingecko_id)
          setEurPair(''); setUsdtPair(''); setBtcPair('')
          setStatus('found_coingecko')
        } else {
          setGeckoId(null)
          setStatus('notfound')
        }
      } catch { setStatus('notfound') }
    }, 600)
    return () => clearTimeout(debounceRef.current)
  }, [symbol])

  async function handleSave() {
    if (!symbol) return
    setSaving(true)
    await portfolioApi.createAsset({
      symbol:            symbol.toUpperCase(),
      name:              name || symbol.toUpperCase(),
      binance_eur_pair:  eurPair  || null,
      binance_usdt_pair: usdtPair || null,
      binance_btc_pair:  btcPair  || null,
      is_stablecoin:     isStable,
      coingecko_id:      geckoId  || null,
    } as Partial<AssetMetadata>)
    setSaving(false)
    onSaved()
  }

  const statusIcon = status === 'detecting'        ? <RefreshCw size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 animate-spin" />
                   : status === 'found_binance'    ? <CheckCircle size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-accent-green" />
                   : status === 'found_coingecko'  ? <CheckCircle size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: '#8b5cf6' }} />
                   : status === 'notfound'         ? <AlertCircle size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-accent-amber" />
                   : null

  return (
    <div className="rounded-xl border border-border bg-background-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Añadir nuevo activo</h3>
        <button onClick={onClose} className="text-gray-600 hover:text-white transition-colors"><X size={16} /></button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Símbolo *</label>
          <div className="relative">
            <input autoFocus value={symbol}
              onChange={e => { setSymbol(e.target.value.toUpperCase()); setEurPair(''); setUsdtPair(''); setBtcPair(''); setGeckoId(null) }}
              placeholder="BTC, ETH, PEPE..." className={`${inputClass} pr-8`} />
            {statusIcon}
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Nombre</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Pepe Coin" className={inputClass} />
        </div>
      </div>

      {status === 'found_binance' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-green/8 border border-accent-green/20 text-xs text-accent-green">
          <CheckCircle size={12} /> Encontrado en Binance — pares configurados automáticamente
        </div>
      )}
      {status === 'found_coingecko' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs"
          style={{ backgroundColor: '#8b5cf608', borderColor: '#8b5cf630', color: '#8b5cf6' }}>
          <CheckCircle size={12} />
          Encontrado en CoinGecko — precio vía <span className="mono font-medium">{geckoId}</span>
        </div>
      )}
      {status === 'notfound' && (
        <div className="px-3 py-2.5 rounded-lg bg-accent-amber/8 border border-accent-amber/20 space-y-1">
          <div className="flex items-center gap-2 text-xs text-accent-amber"><AlertCircle size={12} /> No encontrado en Binance ni CoinGecko</div>
          <p className="text-xs text-gray-500">Introduce los pares manualmente o márcalo como stablecoin.</p>
        </div>
      )}

      {status !== 'found_coingecko' && (
        <div className="grid grid-cols-3 gap-3">
          {([
            { label: 'Par EUR',  val: eurPair,  set: setEurPair,  ph: `${symbol || '?'}EUR`  },
            { label: 'Par USDT', val: usdtPair, set: setUsdtPair, ph: `${symbol || '?'}USDT` },
            { label: 'Par BTC',  val: btcPair,  set: setBtcPair,  ph: `${symbol || '?'}BTC`  },
          ] as const).map(({ label, val, set, ph }) => (
            <div key={label} className="space-y-1">
              <label className="text-xs text-gray-500">{label}</label>
              <input value={val} onChange={e => set(e.target.value.toUpperCase())} placeholder={ph} className={inputClass} />
            </div>
          ))}
        </div>
      )}

      <Toggle checked={isStable} onChange={setIsStable} label="Stablecoin o fiat (sin precio de mercado)" />
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
        <button onClick={handleSave} disabled={!symbol || saving}
          className="px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors">
          {saving ? 'Guardando...' : 'Añadir activo'}
        </button>
      </div>
    </div>
  )
}

// ── AssetsSection ──────────────────────────────────────────────────────────
export function AssetsSection() {
  const queryClient = useQueryClient()
  const prices = usePricesStore(s => s.prices)
  const [search, setSearch]             = useState('')
  const [editingSymbol, setEditingSymbol] = useState<string | null>(null)
  const [showAdd, setShowAdd]           = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [detectingAll, setDetectingAll] = useState(false)
  const [detectResult, setDetectResult] = useState<{ detected: number; failed: number } | null>(null)
  const [showStablecoins, setShowStablecoins] = useState(false)
  const [page, setPage]                 = useState(0)
  const [sortKey, setSortKey]           = useState<SortKey>('name')
  const [sortDir, setSortDir]           = useState<SortDir>('asc')

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['assets'],
    queryFn: portfolioApi.getAssets,
  })

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setPage(0)
  }

  const filtered = assets.filter(a =>
    a.symbol.toLowerCase().includes(search.toLowerCase()) ||
    a.name?.toLowerCase().includes(search.toLowerCase())
  )

  function sortAssets(list: AssetMetadata[]): AssetMetadata[] {
    return [...list].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name')   cmp = (a.name ?? a.symbol).localeCompare(b.name ?? b.symbol)
      if (sortKey === 'source') cmp = a.price_source.localeCompare(b.price_source)
      if (sortKey === 'price') {
        const pa = prices[a.symbol] ?? -1
        const pb = prices[b.symbol] ?? -1
        cmp = pa - pb
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }

  const stablecoins = filtered.filter(a => a.is_stablecoin || a.price_source === 'fiat')
  const unknown     = filtered.filter(a => !a.is_stablecoin && a.price_source === 'unknown')
  const normal      = sortAssets(filtered.filter(a => !a.is_stablecoin && a.price_source !== 'unknown' && a.price_source !== 'fiat'))

  const PAGE_SIZE   = 10
  const totalPages  = Math.ceil(normal.length / PAGE_SIZE)
  const normalPaged = normal.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  async function handleDetectAll() {
    setDetectingAll(true)
    setDetectResult(null)
    try {
      const result = await portfolioApi.detectAllPairs()
      setDetectResult(result)
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    } finally { setDetectingAll(false) }
  }

  async function handleDelete(symbol: string) {
    try {
      await portfolioApi.deleteAsset(symbol)
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    } catch (e) { alert((e as Error).message) }
    setConfirmDelete(null)
  }

  const inputSearch = "w-full bg-background-tertiary border border-border rounded-lg pl-9 pr-3 py-2 text-sm placeholder-gray-600 focus:outline-none focus:border-accent-blue"

  return (
    <div className="h-full flex flex-col">
      {/* Header fijo */}
      <div className="shrink-0 px-6 pt-6 pb-4 space-y-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">Activos y precios</h2>
            <p className="text-xs text-gray-500 mt-0.5">Pares de precio en Binance. Se auto-detectan al importar.</p>
          </div>
          <div className="flex items-center gap-2">
            {unknown.length > 0 && !detectingAll && (
              <button onClick={handleDetectAll}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                style={{ backgroundColor: '#f59e0b18', color: '#f59e0b' }}>
                <Zap size={12} /> Detectar {unknown.length} sin precio
              </button>
            )}
            {detectingAll && (
              <span className="flex items-center gap-1.5 text-xs text-gray-400 px-3 py-2">
                <RefreshCw size={12} className="animate-spin" /> Detectando...
              </span>
            )}
            <button onClick={() => setShowAdd(s => !s)}
              className="flex items-center gap-2 px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 rounded-lg text-sm font-medium transition-colors">
              <Plus size={14} /> Añadir activo
            </button>
          </div>
        </div>

        {detectResult && (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-accent-green/30 bg-accent-green/8 text-sm">
            <span className="flex items-center gap-2 text-accent-green">
              <CheckCircle size={13} />
              {detectResult.detected} actualizado{detectResult.detected !== 1 ? 's' : ''}
              {detectResult.failed > 0 && <span className="text-gray-400">, {detectResult.failed} sin par en Binance</span>}
            </span>
            <button onClick={() => setDetectResult(null)} className="text-gray-600 hover:text-white transition-colors"><X size={13} /></button>
          </div>
        )}

        {showAdd && (
          <AddAssetDialog
            onClose={() => setShowAdd(false)}
            onSaved={() => { queryClient.invalidateQueries({ queryKey: ['assets'] }); setShowAdd(false) }}
          />
        )}

        {/* Search + sort */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input placeholder="Buscar activo..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(0) }} className={inputSearch} />
            {!search && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-700">{assets.length} activos</span>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-xs text-gray-600 mr-1">Ordenar:</span>
            <SortButton label="Nombre" sortKey="name"   active={sortKey} dir={sortDir} onClick={handleSort} />
            <SortButton label="Precio" sortKey="price"  active={sortKey} dir={sortDir} onClick={handleSort} />
            <SortButton label="Fuente" sortKey="source" active={sortKey} dir={sortDir} onClick={handleSort} />
          </div>
        </div>
      </div>

      {/* Lista con scroll */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {isLoading && <div className="py-8 text-center text-gray-500 text-sm">Cargando...</div>}

        {unknown.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 px-1">
              <AlertCircle size={12} className="text-accent-red" />
              <span className="text-xs font-medium text-accent-red">{unknown.length} sin precio configurado</span>
            </div>
            {unknown.map(a => (
              <AssetItem key={a.symbol} asset={a} price={prices[a.symbol]} isEditing={editingSymbol === a.symbol}
                onEdit={() => setEditingSymbol(prev => prev === a.symbol ? null : a.symbol)}
                onSaved={() => { queryClient.invalidateQueries({ queryKey: ['assets'] }); setEditingSymbol(null) }}
                onDelete={() => setConfirmDelete(a.symbol)} />
            ))}
          </div>
        )}

        {normal.length > 0 && (
          <div className="space-y-2">
            <div className="space-y-1.5">
              {normalPaged.map(a => (
                <AssetItem key={a.symbol} asset={a} price={prices[a.symbol]} isEditing={editingSymbol === a.symbol}
                  onEdit={() => setEditingSymbol(prev => prev === a.symbol ? null : a.symbol)}
                  onSaved={() => { queryClient.invalidateQueries({ queryKey: ['assets'] }); setEditingSymbol(null) }}
                  onDelete={() => setConfirmDelete(a.symbol)} />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-gray-600">
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, normal.length)} de {normal.length} activos
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                    className="px-3 py-1.5 text-xs rounded-lg bg-background-tertiary border border-border hover:bg-border disabled:opacity-40 transition-colors">
                    ← Anterior
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => (
                    <button key={i} onClick={() => setPage(i)}
                      className={`w-7 h-7 text-xs rounded-lg transition-colors ${i === page ? 'bg-accent-blue text-white font-medium' : 'bg-background-tertiary border border-border hover:bg-border text-gray-400'}`}>
                      {i + 1}
                    </button>
                  ))}
                  <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                    className="px-3 py-1.5 text-xs rounded-lg bg-background-tertiary border border-border hover:bg-border disabled:opacity-40 transition-colors">
                    Siguiente →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {stablecoins.length > 0 && (
          <div>
            <button onClick={() => setShowStablecoins(s => !s)}
              className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-400 transition-colors py-1 px-1">
              <ChevronDown size={12} className={`transition-transform duration-200 ${showStablecoins ? 'rotate-180' : ''}`} />
              {stablecoins.length} stablecoins y fiat
            </button>
            {showStablecoins && (
              <div className="space-y-1.5 mt-2">
                {stablecoins.map(a => (
                  <AssetItem key={a.symbol} asset={a} price={prices[a.symbol]} isEditing={editingSymbol === a.symbol}
                    onEdit={() => setEditingSymbol(prev => prev === a.symbol ? null : a.symbol)}
                    onSaved={() => { queryClient.invalidateQueries({ queryKey: ['assets'] }); setEditingSymbol(null) }}
                    onDelete={() => setConfirmDelete(a.symbol)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Borrar activo"
          message={`Borrar "${confirmDelete}"? Solo es posible si no tiene transacciones asociadas.`}
          confirmLabel="Borrar" danger
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
