import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Search, RefreshCw, CheckCircle, XCircle, Zap } from 'lucide-react'
import { portfolioApi, type AssetMetadata } from '../../../api/portfolio'
import { Toggle } from '../../../components/Toggle'
import { PairInputsGrid } from './PairInputsGrid'
import { CoinGeckoIdEditor } from './CoinGeckoIdEditor'
import { AssetLogoEditor } from './AssetLogoEditor'
import { T, alpha } from '../../../utils/colors'
import { buttonClasses, fieldClasses } from '../../../components/ui'
import { formatNumber } from '../../../utils/format'

export function AssetEditPanel({ asset, onSaved, onCancel, embedded = false }: {
  asset: AssetMetadata; onSaved: () => void; onCancel: () => void
  /** Dentro del panel lateral (#450): sin el borde ni el fondo de la fila desplegada. */
  embedded?: boolean
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
    <div className={embedded ? 'space-y-4' : 'border-t border-border bg-background-tertiary/20 px-4 py-4 space-y-4'}>
      {/* Logo (#449): de dónde sale y corrección solo para el logo */}
      <AssetLogoEditor asset={asset} />

      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-fg-muted">Editar pares de <span className="mono">{asset.symbol}</span></p>
        <button type="button" onClick={handleDetect} disabled={detecting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
          style={{ backgroundColor: alpha(T.brand, 9), color: T.brand }}>
          {detecting ? <RefreshCw size={11} className="animate-spin" /> : <Zap size={11} />}
          Auto-detectar
        </button>
      </div>

      <PairInputsGrid
        symbol={asset.symbol}
        eurPair={eurPair} setEurPair={setEurPair}
        usdtPair={usdtPair} setUsdtPair={setUsdtPair}
        btcPair={btcPair} setBtcPair={setBtcPair}
        detectRan={detectRan}
      />

      <Toggle checked={isStable} onChange={setIsStable} label="Stablecoin o fiat (sin par de precio)" />

      <div className="pt-2 border-t border-border/50 space-y-2">
        <p className="text-xs text-fg-subtle">Probar par en Binance</p>
        <div className="flex gap-2">
          <input value={testPairVal} onChange={e => setTestPairVal(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleTest()}
            placeholder={`${asset.symbol}EUR, ${asset.symbol}USDT...`}
            className={fieldClasses('md', false, 'flex-1 mono')} />
          <button type="button" onClick={handleTest} disabled={testLoading || !testPairVal} aria-label="Probar el par en Binance" title="Probar el par en Binance"
            className="px-3 py-2 bg-background-tertiary hover:bg-border disabled:opacity-50 rounded-lg text-sm transition-colors">
            {testLoading ? <RefreshCw size={13} aria-hidden="true" className="animate-spin" /> : <Search size={13} aria-hidden="true" />}
          </button>
        </div>
        {testResult && (
          <div className={`flex items-center gap-2 text-xs ${testResult.exists ? 'text-positive' : 'text-negative'}`}>
            {testResult.exists
              ? <><CheckCircle size={12} /> Existe, precio: <span className="mono font-medium">{formatNumber(testResult.price ?? 0, 6, 6)} EUR</span></>
              : <><XCircle size={12} /> Par no encontrado en Binance</>
            }
          </div>
        )}
      </div>

      {isCoinGeckoSource && <CoinGeckoIdEditor asset={asset} onSaved={onSaved} />}

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-fg-muted hover:text-fg transition-colors">Cancelar</button>
        <button type="button" onClick={handleSave} disabled={saving}
          className={buttonClasses('primary', 'md')}>
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
