import { TrendingUp, BarChart2, Zap, TrendingDown } from 'lucide-react'
import { formatEur } from '../../utils/format'

const CARD_META = {
  invested: { icon: TrendingUp,   iconColor: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.2)'  },
  ops:      { icon: BarChart2,    iconColor: '#6366f1', bg: 'rgba(99,102,241,0.08)',  border: 'rgba(99,102,241,0.2)'  },
  fees:     { icon: Zap,          iconColor: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)'  },
  sells:    { icon: TrendingDown, iconColor: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.2)'   },
}

export function StatsBar({ stats }: {
  stats: {
    totals: {
      total_ops: number; unique_assets: number; total_invested: number
      total_fee_ops: number; total_fees_eur: number; total_buys: number; total_sells: number; total_manual: number
    }
  }
}) {
  const { totals } = stats
  const cards = [
    { ...CARD_META.invested, title: 'Invertido',    value: formatEur(totals.total_invested),  sub: `${totals.total_buys} compras`        },
    { ...CARD_META.ops,      title: 'Operaciones',  value: totals.total_ops.toLocaleString('es-ES'), sub: `${totals.unique_assets} activos únicos` },
    { ...CARD_META.fees,     title: 'Comisiones',   value: formatEur(totals.total_fees_eur),   sub: `${totals.total_fee_ops} ops con fee` },
    { ...CARD_META.sells,    title: 'Ventas',       value: totals.total_sells.toLocaleString('es-ES'), sub: `${totals.total_manual} manuales`    },
  ]
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c) => {
        const Icon = c.icon
        return (
          <div key={c.title} className="rounded-2xl p-4 flex items-center gap-3 border"
            style={{ backgroundColor: c.bg, borderColor: c.border }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${c.iconColor}22` }}>
              <Icon size={16} style={{ color: c.iconColor }} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-gray-500 uppercase tracking-widest">{c.title}</div>
              <div className="text-base font-bold mono text-white truncate">{c.value}</div>
              <div className="text-[10px] text-gray-600">{c.sub}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
