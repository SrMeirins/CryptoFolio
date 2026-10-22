import { useState, useEffect } from 'react'
import { RefreshCw, CheckCircle, AlertCircle, X } from 'lucide-react'
import { portfolioApi, type AssetMetadata } from '../../../api/portfolio'
import { Toggle } from '../../../components/Toggle'
import { inputClass } from './helpers'
import { PairInputsGrid } from './PairInputsGrid'
import { T } from '../../../utils/colors'
import { cardClasses, buttonClasses, iconButtonClasses } from '../../../components/ui'

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
  // Al teclear se resetea lo detectado y se marca el estado de forma síncrona
  // (en el handler, no en un efecto); la detección remota va en el efecto.
  function handleSymbolChange(raw: string) {
    const next = raw.toUpperCase()
    setSymbol(next)
    setEurPair(''); setUsdtPair(''); setBtcPair(''); setGeckoId(null)
    setStatus(next.trim().length < 2 ? 'idle' : 'detecting')
  }

  // Detección con debounce de 600 ms. `cancelled` descarta respuestas de un
  // símbolo anterior que lleguen después de que el usuario siga escribiendo.
  useEffect(() => {
    const sym = symbol.trim()
    if (sym.length < 2) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        // 1. Buscar en Binance
        const [eur, usdt, btc] = await Promise.all([
          portfolioApi.testPair(`${sym}EUR`),
          portfolioApi.testPair(`${sym}USDT`),
          portfolioApi.testPair(`${sym}BTC`),
        ])
        if (cancelled) return
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
        if (cancelled) return
        if (cg.found && cg.coingecko_id) {
          setGeckoId(cg.coingecko_id)
          setEurPair(''); setUsdtPair(''); setBtcPair('')
          setStatus('found_coingecko')
        } else {
          setGeckoId(null)
          setStatus('notfound')
        }
      } catch { if (!cancelled) setStatus('notfound') }
    }, 600)
    return () => { cancelled = true; clearTimeout(timer) }
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

  const statusIcon = status === 'detecting'        ? <RefreshCw size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle animate-spin" />
                   : status === 'found_binance'    ? <CheckCircle size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-positive" />
                   : status === 'found_coingecko'  ? <CheckCircle size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: T.purple }} />
                   : status === 'notfound'         ? <AlertCircle size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-warning" />
                   : null

  return (
    <div className={cardClasses('md', 'space-y-4')}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Añadir nuevo activo</h3>
        <button type="button" onClick={onClose} aria-label="Cerrar" className={iconButtonClasses('sm')}><X size={16} /></button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs text-fg-subtle">Símbolo *</label>
          <div className="relative">
            <input autoFocus value={symbol}
              onChange={e => handleSymbolChange(e.target.value)}
              placeholder="BTC, ETH, PEPE..." className={`${inputClass} pr-8`} />
            {statusIcon}
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-fg-subtle">Nombre</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Pepe Coin" className={inputClass} />
        </div>
      </div>

      {status === 'found_binance' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-positive/8 border border-positive/20 text-xs text-positive-ink">
          <CheckCircle size={12} /> Encontrado en Binance — pares configurados automáticamente
        </div>
      )}
      {status === 'found_coingecko' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs"
          style={{ backgroundColor: '#8b5cf608', borderColor: '#8b5cf630', color: T.purple }}>
          <CheckCircle size={12} />
          Encontrado en CoinGecko — precio vía <span className="font-mono font-medium">{geckoId}</span>
        </div>
      )}
      {status === 'notfound' && (
        <div className="px-3 py-2.5 rounded-lg bg-warning/8 border border-warning/20 space-y-1">
          <div className="flex items-center gap-2 text-xs text-warning"><AlertCircle size={12} /> No encontrado en Binance ni CoinGecko</div>
          <p className="text-xs text-fg-subtle">Introduce los pares manualmente o márcalo como stablecoin.</p>
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
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-fg-muted hover:text-fg transition-colors">Cancelar</button>
        <button type="button" onClick={handleSave} disabled={!symbol || saving}
          className={buttonClasses('primary', 'md')}>
          {saving ? 'Guardando...' : 'Añadir activo'}
        </button>
      </div>
    </div>
  )
}
