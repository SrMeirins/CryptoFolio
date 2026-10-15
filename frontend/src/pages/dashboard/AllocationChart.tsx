import { useState, useMemo } from 'react'
import type { FifoLot, FiatBalance } from '../../api/portfolio'
import { usePortfolioValuation } from '../../hooks/usePortfolioValuation'
import { formatMoney, formatPercent } from '../../utils/format'
import { useCurrency } from '../../hooks/useDisplayCurrency'
import { T, alpha, ink } from '../../utils/colors'
import { cardClasses, PanelHeader } from '../../components/ui'
import { allocationSubtitle } from '../../utils/panelSubtitles'
import { PieChart } from 'lucide-react'

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
  const currency = useCurrency()
  const [hovered, setHovered] = useState<string | null>(null)

  const { assets, totalValue: total } = usePortfolioValuation(lots, fiatBalances)
  const items = useMemo<AllocItem[]>(
    () => assets
      .filter(a => a.value > 0)
      .map(a => ({ name: a.asset, value: a.value, isFiat: a.kind === 'fiat' })),
    [assets],
  )
  const top = items.slice(0, 10)

  if (total === 0) return null

  const hoveredIdx  = hovered ? top.findIndex(item => item.name === hovered) : -1
  const hoveredItem = hoveredIdx >= 0 ? top[hoveredIdx] : null
  const hoveredPct  = hoveredItem ? (hoveredItem.value / total) * 100 : 0

  const hasHover = hovered !== null

  return (
    <div className={cardClasses('none', 'px-5 py-5')}>
      <PanelHeader icon={PieChart} title="Distribución" className="mb-4" subtitle={allocationSubtitle(items, total)} />

      {/* Barra apilada interactiva */}
      <div className="flex h-5 rounded-xl overflow-hidden gap-px mb-2">
        {top.map((item, idx) => {
          const color   = colorForItem(item, idx)
          const isHover = hovered === item.name
          const dimmed  = hasHover && !isHover
          return (
            <div
              key={item.name}
              className="transition-all duration-150 cursor-pointer"
              style={{
                width: `${(item.value / total) * 100}%`,
                background: color,
                minWidth: '4px',
                opacity: dimmed ? 0.2 : 1,
                filter: isHover ? `brightness(1.25) drop-shadow(0 0 5px ${alpha(color, 53)})` : 'none',
              }}
              onMouseEnter={() => setHovered(item.name)}
              onMouseLeave={() => setHovered(null)}
            />
          )
        })}
        {items.length > 10 && (
          <div className="flex-1 bg-overlay/5" style={{ minWidth: '2px' }} />
        )}
      </div>

      {/* Panel de detalle en hover — altura fija para evitar saltos */}
      <div className="h-10 mb-3 flex items-center">
        {hoveredItem && (
          <div
            className="w-full px-4 py-2 rounded-xl border flex items-center justify-between transition-all duration-150"
            style={{ borderColor: `${alpha(colorForItem(hoveredItem, hoveredIdx), 25)}`, background: `${alpha(colorForItem(hoveredItem, hoveredIdx), 5)}` }}
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: colorForItem(hoveredItem, hoveredIdx) }} />
              <span className="text-sm font-semibold" style={{ color: ink(colorForItem(hoveredItem, hoveredIdx)) }}>{hoveredItem.name}</span>
              {hoveredItem.isFiat && <span className="text-xs text-fg-subtle">cash</span>}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-fg-subtle mono">{formatPercent(hoveredPct)}</span>
              <span className="text-sm font-semibold mono text-fg">{formatMoney(hoveredItem.value, currency)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Lista ranked */}
      <div className="space-y-1.5">
        {top.map((item, idx) => {
          const pct     = (item.value / total) * 100
          const color   = colorForItem(item, idx)
          const isHover = hovered === item.name
          const dimmed  = hasHover && !isHover
          return (
            <div
              key={item.name}
              className="flex items-center gap-3 px-2 py-1.5 rounded-lg transition-all duration-150 cursor-default"
              style={{
                background: isHover ? `${alpha(color, 7)}` : 'transparent',
                opacity: dimmed ? 0.35 : 1,
              }}
              onMouseEnter={() => setHovered(item.name)}
              onMouseLeave={() => setHovered(null)}
            >
              <span className="text-xs text-fg-subtle w-3 text-right shrink-0">{idx + 1}</span>
              <div className="flex items-center gap-1.5 w-16 shrink-0">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-xs font-medium truncate" style={{ color: isHover || item.isFiat ? ink(color) : T.fg }}>
                  {item.name}
                </span>
              </div>
              <div className="flex-1 h-1.5 bg-overlay/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${pct}%`, background: color, opacity: isHover ? 1 : 0.5 }}
                />
              </div>
              <span className="text-xs text-fg-subtle mono w-10 text-right shrink-0">{formatPercent(pct, 1)}</span>
              <span className="text-xs text-fg-muted mono w-20 text-right shrink-0">{formatMoney(item.value, currency)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
