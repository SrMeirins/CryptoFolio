import { useState, useMemo } from 'react'
import { CryptoIcon } from '../../components/CryptoIcon'
import type { FifoLot, FiatBalance } from '../../api/portfolio'
import { usePortfolioValuation } from '../../hooks/usePortfolioValuation'
import { useDisplayMarket } from '../../hooks/useDisplayMarket'
import { useFlashOnChange, type FlashDirection } from '../../hooks/useFlashOnChange'
import { heatmapCells, moverData, moversSummary, rankLabels, rankMovers, type MoverItem, type MoversMode } from '../../utils/topMovers'
import { formatMoney, formatPercent, formatPrice } from '../../utils/format'
import { useCurrency } from '../../hooks/useDisplayCurrency'
import { T, alpha } from '../../utils/colors'
import { SegmentedControl, cardClasses, PanelHeader, badgeClasses } from '../../components/ui'
import { moversSubtitle } from '../../utils/panelSubtitles'
import { Activity } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { MoversHeatmap } from './MoversHeatmap'

function MoverRow({ asset, pct, value, rank, mode, price, reference, impact }: MoverItem & { mode: MoversMode }) {
  const currency = useCurrency()
  const pctFlash   = useFlashOnChange(pct)
  const valueFlash = useFlashOnChange(value)
  const isUp  = pct >= 0
  const color = isUp ? T.positive : T.negative
  const flashClass = (f: FlashDirection) => (f === 'up' ? 'flash-up' : f === 'down' ? 'flash-down' : '')

  return (
    <div className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-overlay/3">
      <span className="text-xs text-fg-subtle w-3 text-center mono shrink-0">{rank}</span>
      <CryptoIcon symbol={asset} size={32} ring={color} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold leading-tight text-fg">{asset}</p>
        <p className="text-xs text-fg-subtle mono leading-tight mt-0.5 truncate">
          {mode === 'total'
            ? <>Medio {formatPrice(reference, currency)} → {formatPrice(price, currency)}</>
            : <>{formatPrice(price, currency)}</>}
        </p>
        {mode === 'total' && (
          // Precio actual frente al medio: el centro es el precio medio de compra.
          <div className="relative h-1 mt-1.5 rounded-full bg-overlay/6" aria-hidden="true">
            <span className="absolute left-1/2 -top-0.5 w-px h-2 bg-fg-subtle/60" />
            <span className="absolute top-0 h-1 rounded-full"
              style={{ background: color, width: `${Math.min(Math.abs(pct), 100) / 2}%`, left: isUp ? '50%' : `${50 - Math.min(Math.abs(pct), 100) / 2}%` }} />
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className={`text-[13px] font-bold mono px-2 py-0.5 rounded-lg ${flashClass(pctFlash)}`} style={{ background: `${alpha(color, 10)}`, color }}>
          {formatPercent(pct, 2, true)}
        </span>
        <span className="text-xs mono" style={{ color }}>{impact >= 0 ? '+' : '−'}{formatMoney(Math.abs(impact), currency)}</span>
        <span className={`text-[11px] mono text-fg-subtle rounded ${flashClass(valueFlash)}`}>{formatMoney(value, currency)}</span>
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

  const navigate = useNavigate()
  const { top, bottom } = useMemo(() => rankMovers(assets, open24, mode, dustThreshold), [assets, open24, mode, dustThreshold])
  const data = useMemo(() => moverData(assets, open24, mode, dustThreshold), [assets, open24, mode, dustThreshold])
  const cells = useMemo(() => heatmapCells(data), [data])
  const labels = rankLabels(data, top, bottom)
  const summary = moversSummary(data)

  if (lots.length === 0) return null

  function changeMode(next: MoversMode) {
    setMode(next)
    saveMode(next)
  }

  const header = (label: string, color: string, glow: string, textClass: string) => (
    <div className="px-5 py-2.5 border-y border-border flex items-center gap-2 bg-overlay/2">
      <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} style={{ boxShadow: `0 0 6px ${glow}` }} />
      <span className={`text-[11px] font-semibold uppercase tracking-widest ${textClass}`}>{label}</span>
    </div>
  )

  return (
    <div className={cardClasses('none', 'overflow-hidden')}>
      <PanelHeader
        icon={Activity}
        title="Variación"
        className="px-5 py-4 border-b border-border"
        help={<p>{MODE_LABELS[mode].title}. «24h» compara con el precio de hace 24 horas; «Total», con tu precio medio de compra.</p>}
        subtitle={moversSubtitle(mode, data.length)}
        actions={<SegmentedControl label="Métrica de mejores y peores" variant="accent" value={mode} onChange={changeMode}
          options={(['24h', 'total'] as const).map(m => ({ value: m, label: MODE_LABELS[m].short }))} />}
      />

      {top.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-fg-subtle">
          {mode === '24h'
            ? 'Aún no hay precios de hace 24h. Aparecerán en cuanto lleguen del feed en vivo.'
            : 'No hay activos con valor suficiente para comparar.'}
        </p>
      ) : (
        <>
        <div className="px-5 pt-4 pb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {labels.notice && (
              <span className={badgeClasses(labels.notice.startsWith('Mercado en rojo') ? 'negative' : 'positive')}>{labels.notice}</span>
            )}
            <span className={badgeClasses('positive')}>{summary.gains} {mode === '24h' ? (summary.gains === 1 ? 'sube' : 'suben') : 'en ganancia'}</span>
            <span className={badgeClasses('negative')}>{summary.losses} {mode === '24h' ? (summary.losses === 1 ? 'baja' : 'bajan') : 'en pérdida'}</span>
            {summary.best && (
              <span className={badgeClasses('neutral')}>Mejor <span className="text-fg font-semibold">{summary.best.asset}</span> <span className="mono text-positive-ink">{formatPercent(summary.best.pct, 1, true)}</span></span>
            )}
            {summary.worst && (
              <span className={badgeClasses('neutral')}>Peor <span className="text-fg font-semibold">{summary.worst.asset}</span> <span className="mono text-negative-ink">{formatPercent(summary.worst.pct, 1, true)}</span></span>
            )}
          </div>
          <MoversHeatmap cells={cells} mode={mode} currency={currency} onOpen={asset => navigate(`/portfolio?activo=${encodeURIComponent(asset)}`)} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-border">
          <div>
            {header(labels.first, 'bg-positive', T.positive, 'text-positive-ink')}
            <div className="divide-y divide-border/30">
              {top.map(item => <MoverRow key={`${item.asset}-${currency}`} {...item} mode={mode} />)}
            </div>
          </div>
          <div>
            {header(labels.second, 'bg-negative', T.negative, 'text-negative-ink')}
            <div className="divide-y divide-border/30">
              {bottom.map(item => <MoverRow key={`${item.asset}-${currency}`} {...item} mode={mode} />)}
            </div>
          </div>
        </div>
        </>
      )}
    </div>
  )
}
