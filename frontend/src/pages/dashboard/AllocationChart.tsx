import { useState, useMemo } from 'react'
import type { FifoLot, FiatBalance } from '../../api/portfolio'
import { usePricesStore } from '../../store/pricesStore'
import { aggregateLotsByAsset } from '../../utils/assetTable'
import { formatEur } from '../../utils/format'

const ALLOC_COLORS = [
  '#6366f1','#F0B90B','#00c896','#e74c3c','#8b5cf6',
  '#3b82f6','#f59e0b','#10b981','#ef4444','#a78bfa',
  '#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6',
]
const FIAT_COLOR = '#10b981'

interface AllocItem { name: string; value: number; isFiat: boolean }

function colorForItem(item: AllocItem, idx: number): string {
  return item.isFiat ? FIAT_COLOR : ALLOC_COLORS[idx % ALLOC_COLORS.length]
}

export function AllocationChart({ lots, fiatBalances }: { lots: FifoLot[]; fiatBalances: FiatBalance[] }) {
  const prices  = usePricesStore((s) => s.prices)
  const [hovered, setHovered] = useState<string | null>(null)

  const data = useMemo(() => {
    const fiatByAsset = fiatBalances.reduce((acc, b) => {
      acc[b.asset] = (acc[b.asset] ?? 0) + parseFloat(b.balance)
      return acc
    }, {} as Record<string, number>)

    const cryptoValues = Array.from(aggregateLotsByAsset(lots), ([asset, { qty }]) =>
      [asset, qty * (prices[asset] ?? 0)] as const
    ).filter(([, value]) => value > 0)

    const items: AllocItem[] = [
      ...cryptoValues.map(([name, value]) => ({ name, value, isFiat: false })),
      ...Object.entries(fiatByAsset).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value, isFiat: true })),
    ].sort((a, b) => b.value - a.value)

    const total = items.reduce((s, d) => s + d.value, 0)
    return { items, total }
  }, [lots, fiatBalances, prices])

  const { items, total } = data
  const top = items.slice(0, 10)

  if (total === 0) return null

  const hoveredIdx  = hovered ? top.findIndex(d => d.name === hovered) : -1
  const hoveredItem = hoveredIdx >= 0 ? top[hoveredIdx] : null
  const hoveredPct  = hoveredItem ? (hoveredItem.value / total) * 100 : 0

  const hasHover = hovered !== null

  return (
    <div className="bg-background-card border border-border rounded-2xl px-5 py-5">
      <h3 className="text-[11px] text-gray-600 font-medium uppercase tracking-widest mb-4">Distribución</h3>

      {/* Barra apilada interactiva */}
      <div className="flex h-5 rounded-xl overflow-hidden gap-px mb-2">
        {top.map((d, i) => {
          const color   = colorForItem(d, i)
          const isHover = hovered === d.name
          const dimmed  = hasHover && !isHover
          return (
            <div
              key={d.name}
              className="transition-all duration-150 cursor-pointer"
              style={{
                width: `${(d.value / total) * 100}%`,
                background: color,
                minWidth: '4px',
                opacity: dimmed ? 0.2 : 1,
                filter: isHover ? `brightness(1.25) drop-shadow(0 0 5px ${color}88)` : 'none',
              }}
              onMouseEnter={() => setHovered(d.name)}
              onMouseLeave={() => setHovered(null)}
            />
          )
        })}
        {items.length > 10 && (
          <div className="flex-1 bg-white/5" style={{ minWidth: '2px' }} />
        )}
      </div>

      {/* Panel de detalle en hover — altura fija para evitar saltos */}
      <div className="h-10 mb-3 flex items-center">
        {hoveredItem && (
          <div
            className="w-full px-4 py-2 rounded-xl border flex items-center justify-between transition-all duration-150"
            style={{ borderColor: `${colorForItem(hoveredItem, hoveredIdx)}40`, background: `${colorForItem(hoveredItem, hoveredIdx)}0d` }}
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: colorForItem(hoveredItem, hoveredIdx) }} />
              <span className="text-sm font-semibold" style={{ color: colorForItem(hoveredItem, hoveredIdx) }}>{hoveredItem.name}</span>
              {hoveredItem.isFiat && <span className="text-[10px] text-gray-500">cash</span>}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-gray-500 font-mono">{hoveredPct.toFixed(2)}%</span>
              <span className="text-sm font-semibold font-mono text-white">{formatEur(hoveredItem.value)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Lista ranked */}
      <div className="space-y-1.5">
        {top.map((d, i) => {
          const pct     = (d.value / total) * 100
          const color   = colorForItem(d, i)
          const isHover = hovered === d.name
          const dimmed  = hasHover && !isHover
          return (
            <div
              key={d.name}
              className="flex items-center gap-3 px-2 py-1.5 rounded-lg transition-all duration-150 cursor-default"
              style={{
                background: isHover ? `${color}12` : 'transparent',
                opacity: dimmed ? 0.35 : 1,
              }}
              onMouseEnter={() => setHovered(d.name)}
              onMouseLeave={() => setHovered(null)}
            >
              <span className="text-[10px] text-gray-700 w-3 text-right shrink-0">{i + 1}</span>
              <div className="flex items-center gap-1.5 w-16 shrink-0">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-xs font-medium truncate" style={{ color: isHover ? color : (d.isFiat ? color : 'rgb(209 213 219)') }}>
                  {d.name}
                </span>
              </div>
              <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${pct}%`, background: color, opacity: isHover ? 1 : 0.5 }}
                />
              </div>
              <span className="text-[11px] text-gray-500 font-mono w-10 text-right shrink-0">{pct.toFixed(1)}%</span>
              <span className="text-[11px] text-gray-400 font-mono w-20 text-right shrink-0">{formatEur(d.value)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
