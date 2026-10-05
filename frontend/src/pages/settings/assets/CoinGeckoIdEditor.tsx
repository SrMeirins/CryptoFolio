import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Search, RefreshCw, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { portfolioApi, type AssetMetadata } from '../../../api/portfolio'

export function CoinGeckoIdEditor({ asset, onSaved }: { asset: AssetMetadata; onSaved: () => void }) {
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
        <button type="button" onClick={handleTest} disabled={testing || !geckoId.trim()}
          title="Verificar que este ID devuelve precio en CoinGecko"
          className="px-3 py-2 bg-background-tertiary hover:bg-border disabled:opacity-50 rounded-lg text-sm transition-colors">
          {testing ? <RefreshCw size={13} className="animate-spin" /> : <Search size={13} />}
        </button>
        {isDirty && (
          <button type="button" onClick={handleSave} disabled={saving || !geckoId.trim()}
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
