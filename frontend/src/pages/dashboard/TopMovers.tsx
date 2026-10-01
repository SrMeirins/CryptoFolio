import { useState, useMemo } from 'react'
import type { FifoLot } from '../../api/portfolio'
import { usePricesStore } from '../../store/pricesStore'
import { aggregateLotsByAsset } from '../../utils/assetTable'
import { formatEur } from '../../utils/format'

interface MoverItem { asset: string; pct: number; value: number; rank: number }

function MoverRow({ asset, pct, value, rank }: MoverItem) {
  const [imgOk, setImgOk] = useState(true)
  const isUp  = pct >= 0
  const color = isUp ? '#00c896' : '#e74c3c'

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:brightness-110"
      style={{ background: `${color}06` }}
    >
      <span className="text-[10px] text-gray-700 w-4 text-center font-mono shrink-0">{rank}</span>
      {imgOk ? (
        <img
          src={`https://assets.coincap.io/assets/icons/${asset.toLowerCase()}@2x.png`}
          alt={asset}
          className="w-8 h-8 rounded-full shrink-0"
          style={{ boxShadow: `0 0 0 2px ${color}30` }}
          onError={() => setImgOk(false)}
        />
      ) : (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
          style={{ background: `${color}20`, color, boxShadow: `0 0 0 2px ${color}30` }}
        >
          {asset.slice(0, 2)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold leading-tight" style={{ color }}>{asset}</p>
        <p className="text-[10px] text-gray-600 font-mono leading-tight mt-0.5">{formatEur(value)}</p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span
          className="text-[13px] font-bold font-mono px-2 py-0.5 rounded-lg"
          style={{ background: `${color}18`, color }}
        >
          {isUp ? '+' : ''}{pct.toFixed(2)}%
        </span>
        <div className="w-16 h-1 rounded-full overflow-hidden bg-white/5">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(Math.abs(pct) * 2, 100)}%`, background: color, opacity: 0.7 }}
          />
        </div>
      </div>
    </div>
  )
}

export function TopMovers({ lots }: { lots: FifoLot[] }) {
  const prices = usePricesStore(s => s.prices)

  const { top, bottom } = useMemo(() => {
    const items: Omit<MoverItem, 'rank'>[] = []
    for (const [asset, { qty, cost }] of aggregateLotsByAsset(lots)) {
      const price = prices[asset]
      if (!price || qty < 0.000001 || cost <= 0) continue
      const avg = cost / qty
      items.push({ asset, pct: ((price - avg) / avg) * 100, value: qty * price })
    }

    const sorted = [...items].sort((a, b) => b.pct - a.pct)
    return {
      top:    sorted.slice(0, 3).map((item, i) => ({ ...item, rank: i + 1 })),
      bottom: sorted.length >= 2 ? sorted.slice(-3).reverse().map((item, i) => ({ ...item, rank: i + 1 })) : [],
    }
  }, [lots, prices])

  if (top.length === 0) return null

  return (
    <div className="bg-background-card border border-border rounded-2xl overflow-hidden">
      <div className="grid grid-cols-2 divide-x divide-border">
        <div>
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent-green shrink-0" style={{ boxShadow: '0 0 6px #00c896' }} />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-accent-green/80">Mejores</span>
          </div>
          <div className="divide-y divide-border/30">
            {top.map(item => <MoverRow key={item.asset} {...item} />)}
          </div>
        </div>
        <div>
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent-red shrink-0" style={{ boxShadow: '0 0 6px #e74c3c' }} />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-accent-red/80">Peores</span>
          </div>
          <div className="divide-y divide-border/30">
            {bottom.map(item => <MoverRow key={item.asset} {...item} />)}
          </div>
        </div>
      </div>
    </div>
  )
}
