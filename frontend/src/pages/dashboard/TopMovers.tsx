import { useState, useMemo } from 'react'
import { CryptoIcon } from '../../components/CryptoIcon'
import type { FifoLot, FiatBalance } from '../../api/portfolio'
import { usePortfolioValuation } from '../../hooks/usePortfolioValuation'
import { useDisplayMarket } from '../../hooks/useDisplayMarket'
import { useFlashOnChange, type FlashDirection } from '../../hooks/useFlashOnChange'
import { rankMovers, type MoverItem, type MoversMode } from '../../utils/topMovers'
import { formatMoney } from '../../utils/format'
import { useCurrency } from '../../hooks/useDisplayCurrency'
import { T, alpha } from '../../utils/colors'

// Escala de la barra: el % de 24h suele ser mucho menor que el total.
const BAR_SCALE: Record<MoversMode, number> = { '24h': 10, total: 2 }

function MoverRow({ asset, pct, value, rank, mode }: MoverItem & { mode: MoversMode }) {
  const currency = useCurrency()
  const pctFlash   = useFlashOnChange(pct)
  const valueFlash = useFlashOnChange(value)
  const isUp  = pct >= 0
  const color = isUp ? T.positive : T.negative
  const flashClass = (f: FlashDirection) => (f === 'up' ? 'flash-up' : f === 'down' ? 'flash-down' : '')

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:brightness-110"
      style={{ background: `${alpha(color, 2)}` }}
    >
      <span className="text-xs text-fg-subtle w-4 text-center mono shrink-0">{rank}</span>
      <CryptoIcon symbol={asset} size={32} ring={color} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold leading-tight" style={{ color }}>{asset}</p>
        <p className="text-xs text-fg-subtle mono leading-tight mt-0.5">
          <span className={`rounded-lg ${flashClass(valueFlash)}`}>{formatMoney(value, currency)}</span>
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span
          className={`text-[13px] font-bold mono px-2 py-0.5 rounded-lg ${flashClass(pctFlash)}`}
          style={{ background: `${alpha(color, 9)}`, color }}
        >
          {isUp ? '+' : ''}{pct.toFixed(2)}%
        </span>
        <div className="w-16 h-1 rounded-full overflow-hidden bg-overlay/5">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(Math.abs(pct) * BAR_SCALE[mode], 100)}%`, background: color, opacity: 0.7 }}
          />
        </div>
      </div>
    </div>
  )
}

// Preferencia del selector, recordada en este navegador.
const MODE_KEY = 'cryptofolio.topMovers.mode'
const NO_FIAT: FiatBalance[] = []

function readMode(): MoversMode {
  try { return localStorage.getItem(MODE_KEY) === 'total' ? 'total' : '24h' } catch { return '24h' }
}

function saveMode(mode: MoversMode): void {
  try { localStorage.setItem(MODE_KEY, mode) } catch { /* almacenamiento no disponible: solo para esta sesión */ }
}

const MODE_LABELS: Record<MoversMode, { short: string; title: string }> = {
  '24h': { short: '24h', title: 'Variación en las últimas 24 horas' },
  total: { short: 'Total', title: 'Rentabilidad desde la compra (precio medio)' },
}

export function TopMovers({ lots }: { lots: FifoLot[] }) {
  // Precio de hace 24h y umbral de polvo en la moneda de visualización (#177).
  const { currency, open24, dustThreshold } = useDisplayMarket()
  const { assets } = usePortfolioValuation(lots, NO_FIAT)
  const [mode, setMode] = useState<MoversMode>(readMode)

  const { top, bottom } = useMemo(() => rankMovers(assets, open24, mode, dustThreshold), [assets, open24, mode, dustThreshold])

  if (lots.length === 0) return null

  function changeMode(next: MoversMode) {
    setMode(next)
    saveMode(next)
  }

  const header = (label: string, color: string, glow: string, textClass: string) => (
    <div className="px-4 py-3 border-b border-border flex items-center gap-2 min-h-11">
      <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} style={{ boxShadow: `0 0 6px ${glow}` }} />
      <span className={`text-[11px] font-semibold uppercase tracking-widest ${textClass}`}>{label}</span>
    </div>
  )

  return (
    <div className="bg-background-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-xs text-fg-subtle">{MODE_LABELS[mode].title}</span>
        <div role="group" aria-label="Métrica de mejores y peores" className="inline-flex rounded-lg border border-border p-0.5 bg-background-tertiary">
          {(['24h', 'total'] as const).map(m => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              title={MODE_LABELS[m].title}
              onClick={() => changeMode(m)}
              className={`px-2.5 py-1 text-xs rounded-lg transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 ${
                mode === m ? 'bg-brand/15 text-brand font-semibold' : 'text-fg-subtle hover:text-fg'
              }`}>
              {MODE_LABELS[m].short}
            </button>
          ))}
        </div>
      </div>

      {top.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-fg-subtle">
          {mode === '24h'
            ? 'Aún no hay precios de hace 24h. Aparecerán en cuanto lleguen del feed en vivo.'
            : 'No hay activos con valor suficiente para comparar.'}
        </p>
      ) : (
        <div className="grid grid-cols-2 divide-x divide-border">
          <div>
            {header('Mejores', 'bg-positive', T.positive, 'text-positive/80')}
            <div className="divide-y divide-border/30">
              {top.map(item => <MoverRow key={`${item.asset}-${currency}`} {...item} mode={mode} />)}
            </div>
          </div>
          <div>
            {header('Peores', 'bg-negative', T.negative, 'text-negative/80')}
            <div className="divide-y divide-border/30">
              {bottom.map(item => <MoverRow key={`${item.asset}-${currency}`} {...item} mode={mode} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
