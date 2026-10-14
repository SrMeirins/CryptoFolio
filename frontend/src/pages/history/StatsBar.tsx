import { TrendingUp, BarChart2, Zap, TrendingDown } from 'lucide-react'
import { formatMoney, type Currency } from '../../utils/format'
import { T, alpha } from '../../utils/colors'

const CARD_META = {
  invested: { icon: TrendingUp,   iconColor: T.positive, bg: alpha(T.positive, 8),  border: alpha(T.positive, 20)  },
  ops:      { icon: BarChart2,    iconColor: T.brand, bg: alpha(T.brand, 8),  border: alpha(T.brand, 20)  },
  fees:     { icon: Zap,          iconColor: T.warning, bg: alpha(T.warning, 8),  border: alpha(T.warning, 20)  },
  sells:    { icon: TrendingDown, iconColor: T.negative, bg: alpha(T.negative, 8),   border: alpha(T.negative, 20)   },
}

export function StatsBar({ stats }: {
  stats: {
    // Moneda de los importes (#177); los campos *_eur la siguen aunque se llamen así.
    currency?: Currency
    totals: {
      total_ops: number; unique_assets: number; total_invested: number
      total_fee_ops: number; total_fees_eur: number; total_buys: number; total_sells: number; total_manual: number
    }
  }
}) {
  const { totals } = stats
  const money = (v: number) => formatMoney(v, stats.currency ?? 'EUR')
  const cards = [
    { ...CARD_META.invested, title: 'Invertido',    value: money(totals.total_invested),  sub: `${totals.total_buys} compras`        },
    { ...CARD_META.ops,      title: 'Operaciones',  value: totals.total_ops.toLocaleString('es-ES'), sub: `${totals.unique_assets} activos únicos` },
    { ...CARD_META.fees,     title: 'Comisiones',   value: money(totals.total_fees_eur),   sub: `${totals.total_fee_ops} ops con fee` },
    { ...CARD_META.sells,    title: 'Ventas',       value: totals.total_sells.toLocaleString('es-ES'), sub: `${totals.total_manual} manuales`    },
  ]
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c) => {
        const Icon = c.icon
        return (
          <div key={c.title} className="rounded-xl p-4 flex items-center gap-3 border"
            style={{ backgroundColor: c.bg, borderColor: c.border }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${alpha(c.iconColor, 13)}` }}>
              <Icon size={16} style={{ color: c.iconColor }} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-fg-subtle uppercase tracking-widest">{c.title}</div>
              <div className="text-base font-bold mono text-fg truncate">{c.value}</div>
              <div className="text-xs text-fg-subtle">{c.sub}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
