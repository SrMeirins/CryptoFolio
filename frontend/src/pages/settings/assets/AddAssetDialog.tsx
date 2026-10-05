import { useState, useRef, useEffect } from 'react'
import { RefreshCw, CheckCircle, AlertCircle, X } from 'lucide-react'
import { portfolioApi, type AssetMetadata } from '../../../api/portfolio'
import { Toggle } from '../../../components/Toggle'
import { inputClass } from './helpers'
import { PairInputsGrid } from './PairInputsGrid'

type DetectStatus = 'idle' | 'detecting' | 'found_binance' | 'found_coingecko' | 'notfound'

export function AddAssetDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
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
        <button type="button" onClick={onClose} aria-label="Cerrar" className="text-gray-600 hover:text-white transition-colors"><X size={16} /></button>
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
        <PairInputsGrid
          symbol={symbol || '?'}
          eurPair={eurPair} setEurPair={setEurPair}
          usdtPair={usdtPair} setUsdtPair={setUsdtPair}
          btcPair={btcPair} setBtcPair={setBtcPair}
        />
      )}

      <Toggle checked={isStable} onChange={setIsStable} label="Stablecoin o fiat (sin precio de mercado)" />
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
        <button type="button" onClick={handleSave} disabled={!symbol || saving}
          className="px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors">
          {saving ? 'Guardando...' : 'Añadir activo'}
        </button>
      </div>
    </div>
  )
}
