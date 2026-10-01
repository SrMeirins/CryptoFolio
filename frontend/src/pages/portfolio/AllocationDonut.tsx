import { useState, useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { FifoLot, FiatBalance } from '../../api/portfolio'
import { usePricesStore } from '../../store/pricesStore'
import { aggregateLotsByAsset } from '../../utils/assetTable'
import { formatEur } from '../../utils/format'

const DONUT_COLORS = [
  '#6366f1','#F0B90B','#00c896','#e74c3c','#8b5cf6',
  '#3b82f6','#f59e0b','#10b981','#ef4444','#a78bfa',
  '#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6',
]

type DonutItem = { name: string; value: number; pct: number }

export function AllocationDonut({ lots, fiatBalances }: { lots: FifoLot[]; fiatBalances: FiatBalance[] }) {
  const prices = usePricesStore(s => s.prices)

  const [hovered, setHovered] = useState<string | null>(null)

  const { total, items } = useMemo<{ total: number; items: DonutItem[] }>(() => {
    const byAsset = new Map<string, number>()
    for (const [asset, { qty }] of aggregateLotsByAsset(lots)) {
      const price = prices[asset] ?? 0
      if (price > 0) byAsset.set(asset, qty * price)
    }
    for (const b of fiatBalances) {
      const val = parseFloat(b.balance)
      if (val > 0) byAsset.set(b.asset, (byAsset.get(b.asset) ?? 0) + val)
    }
    const total = [...byAsset.values()].reduce((s, v) => s + v, 0)
    if (total === 0) return { total: 0, items: [] }
    const sorted = [...byAsset.entries()].sort((a, b) => b[1] - a[1])
    const top = sorted.slice(0, 8)
    const restVal = sorted.slice(8).reduce((s, [, v]) => s + v, 0)
    return {
      total,
      items: [
        ...top.map(([name, value]) => ({ name, value, pct: (value / total) * 100 })),
        ...(restVal > 0 ? [{ name: 'Otros', value: restVal, pct: (restVal / total) * 100 }] : []),
      ],
    }
  }, [lots, fiatBalances, prices])

  if (total === 0) return null

  const hoveredEntry = items.find(d => d.name === hovered)

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: DonutItem }[] }) => {
    if (!active || !payload?.[0]) return null
    const d = payload[0].payload
    return (
      <div className="bg-gray-950/95 backdrop-blur-sm border border-white/10 rounded-xl px-3 py-2.5 shadow-xl text-xs">
        <p className="font-semibold text-white mono mb-0.5">{d.name}</p>
        <p className="text-gray-300">{formatEur(d.value)}</p>
        <p className="text-gray-500">{d.pct.toFixed(1)}% del portfolio</p>
      </div>
    )
  }

  return (
    <div className="bg-background-card border border-border rounded-2xl p-6 space-y-5">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Distribución del portfolio</h3>
          <p className="text-xs text-gray-600 mt-0.5">{items.length} activos · actualización cada 5 s</p>
        </div>
        <p className="text-xl font-semibold mono text-white">{formatEur(total)}</p>
      </div>

      <div className="flex items-center gap-8">
        {/* Donut más grande */}
        <div className="relative shrink-0" style={{ width: 240, height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={items}
                cx="50%" cy="50%"
                innerRadius={78} outerRadius={110}
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
                onMouseEnter={(data: DonutItem) => setHovered(data.name)}
                onMouseLeave={() => setHovered(null)}
              >
                {items.map((entry, i) => (
                  <Cell
                    key={entry.name}
                    fill={DONUT_COLORS[i % DONUT_COLORS.length]}
                    opacity={hovered && hovered !== entry.name ? 0.25 : 1}
                    style={{ transition: 'opacity 0.2s', cursor: 'default', outline: 'none' }}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          {/* Centro */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
            {hoveredEntry ? (
              <>
                <p className="text-base font-bold text-white mono tracking-tight">{hoveredEntry.name}</p>
                <p className="text-2xl font-semibold mono text-white">{hoveredEntry.pct.toFixed(1)}%</p>
                <p className="text-xs text-gray-500 mono">{formatEur(hoveredEntry.value)}</p>
              </>
            ) : (
              <>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest">portfolio</p>
                <p className="text-lg font-bold mono text-white leading-tight">{formatEur(total)}</p>
              </>
            )}
          </div>
        </div>

        {/* Leyenda — lista vertical con barra de proporción */}
        <div className="flex-1 space-y-2 min-w-0">
          {items.map((entry, i) => {
            const color = DONUT_COLORS[i % DONUT_COLORS.length]
            const isActive = !hovered || hovered === entry.name
            return (
              <div
                key={entry.name}
                className="cursor-default"
                style={{ opacity: isActive ? 1 : 0.3, transition: 'opacity 0.2s' }}
                onMouseEnter={() => setHovered(entry.name)}
                onMouseLeave={() => setHovered(null)}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-xs font-medium text-gray-200 truncate">{entry.name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    <span className="text-xs text-gray-500 mono">{formatEur(entry.value)}</span>
                    <span className="text-xs font-semibold mono w-10 text-right" style={{ color }}>{entry.pct.toFixed(1)}%</span>
                  </div>
                </div>
                {/* Barra proporcional */}
                <div className="h-0.5 bg-background-tertiary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${entry.pct}%`, backgroundColor: color, opacity: 0.6 }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
