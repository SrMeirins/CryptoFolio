import { useState } from 'react'
import { BarChart2, ChevronDown, ChevronUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { CryptoIcon } from '../../components/CryptoIcon'
import { formatMoney, formatAmount, type Currency } from '../../utils/format'
import { fmtMonthLabel } from './helpers'
import { useChartColors } from '../../hooks/useChartColors'
import { cardClasses } from '../../components/ui'

function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number; name?: string }[]; label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className={cardClasses('none', 'px-3 py-2 text-xs shadow-lg')}>
      <p className="text-fg-muted mb-1 font-medium">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-fg mono">{p.name}: <span className="font-bold">{p.value}</span></p>
      ))}
    </div>
  )
}

export function AnalyticsPanel({ stats, onAssetClick }: {
  stats: {
    currency?: Currency
    monthly:   { mes: string; total_ops: number; compras: number; ventas: number; otras_salidas: number; ingresos: number; transferencias: number; eur_invertido: number }[]
    topAssets: { asset: string; ops: number; eur_volume: number }[]
    fees:      { asset: string; ops: number; total_amount: number; total_eur: number }[]
  }
  onAssetClick: (asset: string) => void
}) {
  const c = useChartColors()
  const [open, setOpen] = useState(false)
  const chartData = stats.monthly.map(m => ({
    name:          fmtMonthLabel(m.mes),
    Compras:       m.compras,
    Ventas:        m.ventas,
    'Otras salidas': m.otras_salidas,
    Ingresos:      m.ingresos,
    Transferencias: m.transferencias,
    Otros:         m.total_ops - m.compras - m.ventas - m.otras_salidas - m.ingresos - m.transferencias,
  }))
  const maxOps = Math.max(...stats.monthly.map(m => m.total_ops), 1)

  return (
    <div className={cardClasses('none', 'overflow-hidden')}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-overlay/2 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BarChart2 size={14} className="text-fg-subtle" />
          <span className="text-sm font-medium">Analítica de actividad</span>
          <span className="text-xs text-fg-subtle">últimos 18 meses · top activos · fees</span>
        </div>
        {open ? <ChevronUp size={14} className="text-fg-subtle" /> : <ChevronDown size={14} className="text-fg-subtle" />}
      </button>

      {open && (
        <div className="border-t border-border p-5 space-y-5">
          {/* Gráfico — ancho completo */}
          <div>
            <p className="text-[11px] text-fg-subtle uppercase tracking-widest mb-3">Operaciones por mes</p>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barSize={10} barGap={1}>
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: c.axisMuted }} axisLine={false} tickLine={false} />
                <YAxis hide domain={[0, maxOps * 1.2]} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: c.cursorSoft }} />
                <Bar dataKey="Compras"        stackId="a" fill={c.gain} />
                <Bar dataKey="Ventas"         stackId="a" fill={c.loss} />
                <Bar dataKey="Otras salidas"  stackId="a" fill={c.loss} fillOpacity={0.45} />
                <Bar dataKey="Ingresos"       stackId="a" fill={c.warn} />
                <Bar dataKey="Transferencias" stackId="a" fill={c.neutral} />
                <Bar dataKey="Otros"          stackId="a" fill={c.neutralSoft} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
              {([['Compras',c.gain,1],['Ventas',c.loss,1],['Otras salidas',c.loss,0.45],['Ingresos',c.warn,1],['Transferencias',c.neutral,1],['Otros',c.neutralSoft,1]] as const).map(([l,c,o]) => (
                <div key={l} className="flex items-center gap-1.5 text-xs text-fg-subtle">
                  <div className="w-2 h-2 rounded-lg" style={{ backgroundColor: c, opacity: o }} />{l}
                </div>
              ))}
            </div>
          </div>

          {/* Top activos + Fees — dos columnas iguales */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1 border-t border-border/50">
            {/* Top activos */}
            <div>
              <p className="text-[11px] text-fg-subtle uppercase tracking-widest mb-2">
                Top activos <span className="text-fg-subtle normal-case">· último año</span>
              </p>
              <div className="space-y-1.5">
                {stats.topAssets.slice(0, 6).map((row) => (
                  <button
                    key={row.asset}
                    type="button"
                    onClick={() => onAssetClick(row.asset)}
                    className="w-full flex items-center gap-2 group/asset hover:bg-background-tertiary/50 rounded-lg px-1 py-0.5 transition-colors"
                    title={`Filtrar por ${row.asset}`}
                  >
                    <CryptoIcon symbol={row.asset} size={16} />
                    <span className="text-xs mono font-bold text-fg w-12 shrink-0 group-hover/asset:text-fg transition-colors">{row.asset}</span>
                    <div className="flex-1 h-1.5 bg-background-tertiary rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-brand/60 group-hover/asset:bg-brand-solid text-on-brand transition-colors"
                        style={{ width: `${(row.ops / (stats.topAssets[0]?.ops ?? 1)) * 100}%` }} />
                    </div>
                    <span className="text-xs text-fg-subtle w-5 text-right shrink-0">{row.ops}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-fg-subtle mt-1.5 pl-1">Click para filtrar</p>
            </div>

            {/* Fees por activo */}
            {stats.fees.length > 0 && (
              <div>
                <p className="text-[11px] text-fg-subtle uppercase tracking-widest mb-2">
                  Fees por activo <span className="text-fg-subtle normal-case">· último año</span>
                </p>
                <div className="space-y-1.5">
                  {stats.fees.map((row) => (
                    <div key={row.asset} className="flex items-center gap-2">
                      <CryptoIcon symbol={row.asset} size={16} />
                      <span className="text-xs mono font-bold text-fg w-12 shrink-0">{row.asset}</span>
                      <div className="flex-1 h-1.5 bg-background-tertiary rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-warning/50"
                          style={{ width: `${(row.total_eur / (stats.fees[0]?.total_eur ?? 1)) * 100}%` }} />
                      </div>
                      {row.total_eur > 0
                        ? <span className="text-xs text-fg-muted mono font-semibold shrink-0">{formatMoney(row.total_eur, stats.currency ?? 'EUR')}</span>
                        : <span className="text-xs text-fg-subtle mono shrink-0">{formatAmount(row.total_amount, 4)}</span>
                      }
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
