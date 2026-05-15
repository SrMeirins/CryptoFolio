import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { portfolioApi, AssetMetadata } from '../api/portfolio'
import {
  Search, Plus, RefreshCw, CheckCircle, XCircle,
  AlertCircle, ChevronDown, ChevronUp, Edit2, Zap
} from 'lucide-react'

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  eur_direct: { label: 'EUR directo',  color: 'text-accent-green' },
  usdt_proxy: { label: 'Via USDT',     color: 'text-accent-blue' },
  btc_proxy:  { label: 'Via BTC',      color: 'text-accent-amber' },
  fiat:       { label: 'Fiat',         color: 'text-gray-400' },
  unknown:    { label: 'Sin precio',   color: 'text-accent-red' },
}

export function Settings() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editingSymbol, setEditingSymbol] = useState<string | null>(null)
  const [testingPair, setTestingPair] = useState('')
  const [testResult, setTestResult] = useState<{ exists: boolean; price?: number } | null>(null)
  const [testLoading, setTestLoading] = useState(false)

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['assets'],
    queryFn: portfolioApi.getAssets,
  })

  const detectMutation = useMutation({
    mutationFn: (symbol: string) => portfolioApi.detectPairs(symbol),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assets'] }),
  })

  const filtered = assets.filter(a =>
    a.symbol.toLowerCase().includes(search.toLowerCase()) ||
    a.name?.toLowerCase().includes(search.toLowerCase())
  )

  async function handleTestPair() {
    if (!testingPair) return
    setTestLoading(true)
    setTestResult(null)
    const result = await portfolioApi.testPair(testingPair)
    setTestResult(result)
    setTestLoading(false)
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold">Configuración</h1>

      {/* Sección Activos */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">Activos y pares de Binance</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Gestiona los pares de precios para cada criptoactivo. Si importas un activo nuevo, se auto-detecta automáticamente.
            </p>
          </div>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={14} />
            Añadir activo
          </button>
        </div>

        {/* Formulario añadir */}
        {showAdd && (
          <AddAssetForm
            onSave={async (data) => {
              await portfolioApi.createAsset(data)
              queryClient.invalidateQueries({ queryKey: ['assets'] })
              setShowAdd(false)
            }}
            onCancel={() => setShowAdd(false)}
            onDetect={async (symbol) => {
              const result = await portfolioApi.detectPairs(symbol)
              return result
            }}
          />
        )}

        {/* Probar par */}
        <div className="card space-y-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Zap size={14} className="text-accent-amber" />
            Probar par en Binance
          </h3>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="XRPEUR, HBARUSDT, PEPEBTC..."
              value={testingPair}
              onChange={e => setTestingPair(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleTestPair()}
              className="flex-1 bg-background-tertiary border border-border rounded-lg px-3 py-2 text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-accent-blue"
            />
            <button
              onClick={handleTestPair}
              disabled={testLoading || !testingPair}
              className="flex items-center gap-2 px-4 py-2 bg-background-tertiary hover:bg-border disabled:opacity-50 rounded-lg text-sm transition-colors"
            >
              {testLoading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
              Probar
            </button>
          </div>
          {testResult && (
            <div className={`flex items-center gap-2 text-sm ${testResult.exists ? 'text-accent-green' : 'text-accent-red'}`}>
              {testResult.exists
                ? <><CheckCircle size={14} /> Par existe en Binance — Precio actual: <span className="mono font-medium">{testResult.price?.toFixed(6)}</span></>
                : <><XCircle size={14} /> Par no encontrado en Binance</>
              }
            </div>
          )}
        </div>

        {/* Buscador */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar activo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-background-tertiary border border-border rounded-lg pl-9 pr-3 py-2 text-sm placeholder-gray-600 focus:outline-none focus:border-accent-blue"
          />
        </div>

        {/* Tabla de activos */}
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-border">
                <th className="text-left px-5 py-3">Símbolo</th>
                <th className="text-left px-4 py-3">Par EUR</th>
                <th className="text-left px-4 py-3">Par USDT</th>
                <th className="text-left px-4 py-3">Par BTC</th>
                <th className="text-left px-4 py-3">Fuente</th>
                <th className="text-center px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-500 text-sm">Cargando...</td></tr>
              )}
              {filtered.map(asset => (
                <AssetRow
                  key={asset.symbol}
                  asset={asset}
                  isEditing={editingSymbol === asset.symbol}
                  onEdit={() => setEditingSymbol(asset.symbol)}
                  onCancelEdit={() => setEditingSymbol(null)}
                  onSave={async (data) => {
                    await portfolioApi.updateAsset(asset.symbol, data)
                    queryClient.invalidateQueries({ queryKey: ['assets'] })
                    setEditingSymbol(null)
                  }}
                  onDetect={() => detectMutation.mutate(asset.symbol)}
                  detecting={detectMutation.isPending && detectMutation.variables === asset.symbol}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Fila de activo ─────────────────────────────────────────────────────────
function AssetRow({ asset, isEditing, onEdit, onCancelEdit, onSave, onDetect, detecting }: {
  asset: AssetMetadata
  isEditing: boolean
  onEdit: () => void
  onCancelEdit: () => void
  onSave: (data: Partial<AssetMetadata>) => void
  onDetect: () => void
  detecting: boolean
}) {
  const [eurPair, setEurPair] = useState(asset.binance_eur_pair ?? '')
  const [usdtPair, setUsdtPair] = useState(asset.binance_usdt_pair ?? '')
  const [btcPair, setBtcPair] = useState(asset.binance_btc_pair ?? '')

  const source = SOURCE_LABELS[asset.price_source] ?? SOURCE_LABELS.unknown

  if (isEditing) {
    return (
      <tr className="bg-background-tertiary/30">
        <td className="px-5 py-3">
          <span className="font-bold mono">{asset.symbol}</span>
          {asset.auto_detected && (
            <span className="ml-2 text-xs text-accent-blue">auto</span>
          )}
        </td>
        <td className="px-4 py-2">
          <input
            value={eurPair}
            onChange={e => setEurPair(e.target.value.toUpperCase())}
            placeholder="XRPEUR"
            className="w-full bg-background-secondary border border-border rounded px-2 py-1 text-xs mono focus:outline-none focus:border-accent-blue"
          />
        </td>
        <td className="px-4 py-2">
          <input
            value={usdtPair}
            onChange={e => setUsdtPair(e.target.value.toUpperCase())}
            placeholder="XRPUSDT"
            className="w-full bg-background-secondary border border-border rounded px-2 py-1 text-xs mono focus:outline-none focus:border-accent-blue"
          />
        </td>
        <td className="px-4 py-2">
          <input
            value={btcPair}
            onChange={e => setBtcPair(e.target.value.toUpperCase())}
            placeholder="XRPBTC"
            className="w-full bg-background-secondary border border-border rounded px-2 py-1 text-xs mono focus:outline-none focus:border-accent-blue"
          />
        </td>
        <td className="px-4 py-2" />
        <td className="px-4 py-2 text-center">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => onSave({
                binance_eur_pair: eurPair || null,
                binance_usdt_pair: usdtPair || null,
                binance_btc_pair: btcPair || null,
              } as Partial<AssetMetadata>)}
              className="text-xs px-3 py-1.5 bg-accent-blue hover:bg-accent-blue/80 rounded-lg font-medium transition-colors"
            >
              Guardar
            </button>
            <button
              onClick={onCancelEdit}
              className="text-xs px-3 py-1.5 bg-background-card hover:bg-border rounded-lg transition-colors text-gray-400"
            >
              Cancelar
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="hover:bg-background-tertiary/50 transition-colors">
      <td className="px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="font-bold mono">{asset.symbol}</span>
          {asset.auto_detected && (
            <span className="text-xs text-accent-blue bg-accent-blue/10 px-1.5 py-0.5 rounded">auto</span>
          )}
          {asset.price_source === 'unknown' && (
            <AlertCircle size={12} className="text-accent-red" />
          )}
        </div>
        <div className="text-xs text-gray-500">{asset.name}</div>
      </td>
      <td className="px-4 py-3 mono text-xs text-gray-400">
        {asset.binance_eur_pair ?? <span className="text-gray-700">—</span>}
      </td>
      <td className="px-4 py-3 mono text-xs text-gray-400">
        {asset.binance_usdt_pair ?? <span className="text-gray-700">—</span>}
      </td>
      <td className="px-4 py-3 mono text-xs text-gray-400">
        {asset.binance_btc_pair ?? <span className="text-gray-700">—</span>}
      </td>
      <td className="px-4 py-3">
        <span className={`text-xs font-medium ${source.color}`}>{source.label}</span>
      </td>
      <td className="px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={onEdit}
            className="text-gray-500 hover:text-white transition-colors p-1"
            title="Editar pares"
          >
            <Edit2 size={13} />
          </button>
          <button
            onClick={onDetect}
            disabled={detecting}
            className="text-gray-500 hover:text-accent-blue transition-colors p-1 disabled:opacity-50"
            title="Auto-detectar pares en Binance"
          >
            <RefreshCw size={13} className={detecting ? 'animate-spin' : ''} />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Formulario añadir activo ───────────────────────────────────────────────
function AddAssetForm({ onSave, onCancel, onDetect }: {
  onSave: (data: Partial<AssetMetadata>) => void
  onCancel: () => void
  onDetect: (symbol: string) => Promise<AssetMetadata>
}) {
  const [symbol, setSymbol] = useState('')
  const [name, setName] = useState('')
  const [eurPair, setEurPair] = useState('')
  const [usdtPair, setUsdtPair] = useState('')
  const [btcPair, setBtcPair] = useState('')
  const [detecting, setDetecting] = useState(false)
  const [detected, setDetected] = useState(false)

  async function handleDetect() {
    if (!symbol) return
    setDetecting(true)
    const result = await onDetect(symbol.toUpperCase())
    setEurPair(result.binance_eur_pair ?? '')
    setUsdtPair(result.binance_usdt_pair ?? '')
    setBtcPair(result.binance_btc_pair ?? '')
    setDetected(true)
    setDetecting(false)
  }

  const inputClass = "w-full bg-background-tertiary border border-border rounded-lg px-3 py-2 text-sm mono placeholder-gray-600 focus:outline-none focus:border-accent-blue"

  return (
    <div className="card space-y-4">
      <h3 className="font-medium text-sm">Añadir nuevo activo</h3>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Símbolo *</label>
          <div className="flex gap-2">
            <input
              value={symbol}
              onChange={e => { setSymbol(e.target.value.toUpperCase()); setDetected(false) }}
              placeholder="PEPE"
              className={inputClass}
            />
            <button
              onClick={handleDetect}
              disabled={!symbol || detecting}
              className="flex items-center gap-1.5 px-3 py-2 bg-accent-blue/10 hover:bg-accent-blue/20 text-accent-blue disabled:opacity-50 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
            >
              {detecting
                ? <RefreshCw size={12} className="animate-spin" />
                : <Zap size={12} />
              }
              Auto-detectar
            </button>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Nombre</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Pepe Coin" className={inputClass} />
        </div>
      </div>

      {detected && (
        <div className="flex items-center gap-2 text-xs text-accent-green">
          <CheckCircle size={12} />
          Pares detectados automáticamente desde Binance
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Par EUR</label>
          <input value={eurPair} onChange={e => setEurPair(e.target.value.toUpperCase())} placeholder="PEPEEUR" className={inputClass} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Par USDT</label>
          <input value={usdtPair} onChange={e => setUsdtPair(e.target.value.toUpperCase())} placeholder="PEPEUSDT" className={inputClass} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Par BTC</label>
          <input value={btcPair} onChange={e => setBtcPair(e.target.value.toUpperCase())} placeholder="PEPEBTC" className={inputClass} />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
          Cancelar
        </button>
        <button
          onClick={() => onSave({ symbol, name, binance_eur_pair: eurPair || null, binance_usdt_pair: usdtPair || null, binance_btc_pair: btcPair || null } as Partial<AssetMetadata>)}
          disabled={!symbol}
          className="px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
        >
          Guardar activo
        </button>
      </div>
    </div>
  )
}
