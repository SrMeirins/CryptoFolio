import { TrendingUp, BarChart2, Zap, TrendingDown } from 'lucide-react'
import { formatMoney, type Currency, formatNumber } from '../../utils/format'
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
      total_ops: number; unique_assets: number; total_invested: number; total_fiat_buys: number
      total_fee_ops: number; total_fees_eur: number; fees_sin_valor: number
      total_sells: number; total_sold: number; total_manual: number
    }
  }
}) {
  const { totals } = stats
  const money = (v: number) => formatMoney(v, stats.currency ?? 'EUR')
  const count = (n: number, one: string, many: string) => `${formatNumber(n, 0)} ${n === 1 ? one : many}`
  // Definiciones (#346): Invertido = fiat pagado en compras; Ventas = SELL*,
  // sin pérdidas ni regalos; Comisiones = todas, valoradas con el FIFO.
  const cards = [
    { ...CARD_META.invested, title: 'Invertido',    value: money(totals.total_invested),
      sub: count(totals.total_fiat_buys, 'compra con fiat', 'compras con fiat') },
    { ...CARD_META.ops,      title: 'Operaciones',  value: formatNumber(totals.total_ops, 0),
      sub: `${count(totals.unique_assets, 'activo', 'activos')} · ${count(totals.total_manual, 'manual', 'manuales')}` },
    { ...CARD_META.fees,     title: 'Comisiones',   value: money(totals.total_fees_eur),
      sub: count(totals.total_fee_ops, 'operación con comisión', 'operaciones con comisión')
        + (totals.fees_sin_valor > 0 ? ` · ${formatNumber(totals.fees_sin_valor, 0)} sin precio` : '') },
    { ...CARD_META.sells,    title: 'Ventas',       value: money(totals.total_sold),
      sub: count(totals.total_sells, 'venta', 'ventas') },
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
