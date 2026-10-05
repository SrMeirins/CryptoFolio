import { XCircle } from 'lucide-react'
import { inputClass } from './helpers'

/**
 * Grid de 3 inputs (pares EUR/USDT/BTC) — antes repetido casi idéntico en
 * AssetEditPanel y AddAssetDialog. `detectRan` controla el aviso "No
 * disponible" tras una auto-detección (solo aplica en AssetEditPanel).
 */
export function PairInputsGrid({ symbol, eurPair, setEurPair, usdtPair, setUsdtPair, btcPair, setBtcPair, detectRan }: {
  symbol: string
  eurPair: string;  setEurPair:  (v: string) => void
  usdtPair: string; setUsdtPair: (v: string) => void
  btcPair: string;  setBtcPair:  (v: string) => void
  detectRan?: boolean
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {([
        { label: 'Par EUR',  val: eurPair,  set: setEurPair,  ph: `${symbol}EUR`  },
        { label: 'Par USDT', val: usdtPair, set: setUsdtPair, ph: `${symbol}USDT` },
        { label: 'Par BTC',  val: btcPair,  set: setBtcPair,  ph: `${symbol}BTC`  },
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
  )
}
