import { useState, useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { FifoLot, FiatBalance } from '../../api/portfolio'
import { usePortfolioValuation } from '../../hooks/usePortfolioValuation'
import { formatEur } from '../../utils/format'

const DONUT_COLORS = [
  '#6366f1','#F0B90B','#00c896','#e74c3c','#8b5cf6',
  '#3b82f6','#f59e0b','#10b981','#ef4444','#a78bfa',
  '#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6',
]

type DonutItem = { name: string; value: number; pct: number }

/** Tooltip del donut: definido a nivel de módulo para no recrear el componente en cada render. */
function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: DonutItem }[] }) {
  if (!active || !payload?.[0]) return null
  const item = payload[0].payload
  return (
    <div className="bg-gray-950/95 backdrop-blur-sm border border-white/10 rounded-xl px-3 py-2.5 shadow-xl text-xs">
      <p className="font-semibold text-white mono mb-0.5">{item.name}</p>
      <p className="text-gray-300">{formatEur(item.value)}</p>
      <p className="text-gray-500">{item.pct.toFixed(1)}% del portfolio</p>
    </div>
  )
}

export function AllocationDonut({ lots, fiatBalances }: { lots: FifoLot[]; fiatBalances: FiatBalance[] }) {
  const [hovered, setHovered] = useState<string | null>(null)

  const { assets, totalValue: total } = usePortfolioValuation(lots, fiatBalances)
  const items = useMemo<DonutItem[]>(() => {
    if (total === 0) return []
    const valued = assets.filter(a => a.value > 0)   // ya ordenados por valor
    const top = valued.slice(0, 8)
    const restVal = valued.slice(8).reduce((sum, a) => sum + a.value, 0)
    return [
      ...top.map(a => ({ name: a.asset, value: a.value, pct: (a.value / total) * 100 })),
      ...(restVal > 0 ? [{ name: 'Otros', value: restVal, pct: (restVal / total) * 100 }] : []),
    ]
  }, [assets, total])

  if (total === 0) return null

  const hoveredEntry = items.find(item => item.name === hovered)

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
                {items.map((entry, idx) => (
                  <Cell
                    key={entry.name}
                    fill={DONUT_COLORS[idx % DONUT_COLORS.length]}
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
          {items.map((entry, idx) => {
            const color = DONUT_COLORS[idx % DONUT_COLORS.length]
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
