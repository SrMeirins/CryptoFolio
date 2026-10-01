import { useState } from 'react'
import { BarChart2, ChevronDown, ChevronUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { CryptoIcon } from '../../components/CryptoIcon'
import { formatEur, formatAmount } from '../../utils/format'
import { fmtMonthLabel } from './helpers'

function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number; name?: string }[]; label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-background-card border border-border rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="text-gray-400 mb-1 font-medium">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-white mono">{p.name}: <span className="font-bold">{p.value}</span></p>
      ))}
    </div>
  )
}

export function AnalyticsPanel({ stats, onAssetClick }: {
  stats: {
    monthly:   { mes: string; total_ops: number; compras: number; ventas: number; ingresos: number; transferencias: number; eur_invertido: number }[]
    topAssets: { asset: string; ops: number; eur_volume: number }[]
    fees:      { asset: string; ops: number; total_amount: number; total_eur: number }[]
  }
  onAssetClick: (asset: string) => void
}) {
  const [open, setOpen] = useState(false)
  const chartData = stats.monthly.map(m => ({
    name:          fmtMonthLabel(m.mes),
    Compras:       m.compras,
    Ventas:        m.ventas,
    Ingresos:      m.ingresos,
    Transferencias: m.transferencias,
    Otros:         m.total_ops - m.compras - m.ventas - m.ingresos - m.transferencias,
  }))
  const maxOps = Math.max(...stats.monthly.map(m => m.total_ops), 1)

  return (
    <div className="bg-background-card border border-border rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <BarChart2 size={14} className="text-gray-500" />
          <span className="text-sm font-medium">Analítica de actividad</span>
          <span className="text-[10px] text-gray-600">últimos 18 meses · top activos · fees</span>
        </div>
        {open ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
      </button>

      {open && (
        <div className="border-t border-border p-5 space-y-5">
          {/* Gráfico — ancho completo */}
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-3">Operaciones por mes</p>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barSize={10} barGap={1}>
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis hide domain={[0, maxOps * 1.2]} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="Compras"        stackId="a" fill="#10b981" />
                <Bar dataKey="Ventas"         stackId="a" fill="#ef4444" />
                <Bar dataKey="Ingresos"       stackId="a" fill="#f59e0b" />
                <Bar dataKey="Transferencias" stackId="a" fill="#6b7280" />
                <Bar dataKey="Otros"          stackId="a" fill="#4b5563" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2">
              {[['Compras','#10b981'],['Ventas','#ef4444'],['Ingresos','#f59e0b'],['Transferencias','#6b7280'],['Otros','#4b5563']].map(([l,c]) => (
                <div key={l} className="flex items-center gap-1.5 text-[10px] text-gray-500">
                  <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: c }} />{l}
                </div>
              ))}
            </div>
          </div>

          {/* Top activos + Fees — dos columnas iguales */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1 border-t border-border/50">
            {/* Top activos */}
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">
                Top activos <span className="text-gray-700 normal-case">· último año</span>
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
                    <span className="text-xs mono font-bold text-gray-300 w-12 shrink-0 group-hover/asset:text-white transition-colors">{row.asset}</span>
                    <div className="flex-1 h-1.5 bg-background-tertiary rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-accent-blue/60 group-hover/asset:bg-accent-blue transition-colors"
                        style={{ width: `${(row.ops / (stats.topAssets[0]?.ops ?? 1)) * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-500 w-5 text-right shrink-0">{row.ops}</span>
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-gray-700 mt-1.5 pl-1">Click para filtrar</p>
            </div>

            {/* Fees por activo */}
            {stats.fees.length > 0 && (
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">
                  Fees por activo <span className="text-gray-700 normal-case">· último año</span>
                </p>
                <div className="space-y-1.5">
                  {stats.fees.map((row) => (
                    <div key={row.asset} className="flex items-center gap-2">
                      <CryptoIcon symbol={row.asset} size={16} />
                      <span className="text-xs mono font-bold text-gray-300 w-12 shrink-0">{row.asset}</span>
                      <div className="flex-1 h-1.5 bg-background-tertiary rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-accent-amber/50"
                          style={{ width: `${(row.total_eur / (stats.fees[0]?.total_eur ?? 1)) * 100}%` }} />
                      </div>
                      {row.total_eur > 0
                        ? <span className="text-[11px] text-gray-400 mono font-semibold shrink-0">{formatEur(row.total_eur)}</span>
                        : <span className="text-[10px] text-gray-600 mono shrink-0">{formatAmount(row.total_amount, 4)}</span>
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
