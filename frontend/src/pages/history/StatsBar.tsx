import { TrendingUp, BarChart2, Zap, TrendingDown, Coins } from 'lucide-react'
import type { HistoryStats } from '../../api/portfolio'
import { formatMoney, type Currency, formatNumber } from '../../utils/format'
import { T, alpha } from '../../utils/colors'

const CARD_META = {
  invested: { icon: TrendingUp,   iconColor: T.positive, bg: alpha(T.positive, 8),  border: alpha(T.positive, 20)  },
  ops:      { icon: BarChart2,    iconColor: T.brand, bg: alpha(T.brand, 8),  border: alpha(T.brand, 20)  },
  income:   { icon: Coins,        iconColor: T.info, bg: alpha(T.info, 8),  border: alpha(T.info, 20)  },
  fees:     { icon: Zap,          iconColor: T.warning, bg: alpha(T.warning, 8),  border: alpha(T.warning, 20)  },
  sells:    { icon: TrendingDown, iconColor: T.negative, bg: alpha(T.negative, 8),   border: alpha(T.negative, 20)   },
}

/**
 * Tarjetas de resumen del Historial sobre lo filtrado (#346, #376). Con
 * filtros activos se rotulan como tales; los importes vienen en ambas monedas.
 */
export function StatsBar({ totals, currency, filtered }: {
  totals: HistoryStats['totals']
  currency: Currency
  filtered: boolean
}) {
  const money = (v: { EUR: number; USD: number }) => formatMoney(v[currency], currency)
  const count = (n: number, one: string, many: string) => `${formatNumber(n, 0)} ${n === 1 ? one : many}`
  const sinPrecio = (n: number) => (n > 0 ? ` · ${formatNumber(n, 0)} sin precio` : '')
  // Definiciones (#346): Invertido = fiat pagado en compras; Ventas = SELL*,
  // sin pérdidas ni regalos; Comisiones = todas, valoradas con el FIFO;
  // Ingresos = staking, recompensas, intereses, airdrops… (#376).
  const cards = [
    { ...CARD_META.invested, title: 'Invertido',    value: money(totals.invested),
      sub: count(totals.fiat_buys, 'compra con fiat', 'compras con fiat') },
    { ...CARD_META.ops,      title: 'Operaciones',  value: formatNumber(totals.ops, 0),
      sub: `${count(totals.unique_assets, 'activo', 'activos')} · ${count(totals.manual, 'manual', 'manuales')}` },
    { ...CARD_META.income,   title: 'Ingresos',     value: money(totals.income),
      sub: count(totals.income_ops, 'ingreso', 'ingresos') + sinPrecio(totals.income_sin_valor) },
    { ...CARD_META.fees,     title: 'Comisiones',   value: money(totals.fees),
      sub: count(totals.fee_ops, 'operación con comisión', 'operaciones con comisión') + sinPrecio(totals.fees_sin_valor) },
    { ...CARD_META.sells,    title: 'Ventas',       value: money(totals.sold),
      sub: count(totals.sells, 'venta', 'ventas') },
  ]
  return (
    <section aria-labelledby="historial-resumen">
      <h2 id="historial-resumen" className="text-[11px] text-fg-subtle uppercase tracking-widest mb-2">
        Resumen{filtered && <span className="normal-case tracking-normal"> · según los filtros</span>}
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {cards.map((c) => {
          const Icon = c.icon
          return (
            <div key={c.title} className="rounded-xl p-4 flex items-center gap-3 border"
              style={{ backgroundColor: c.bg, borderColor: c.border }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${alpha(c.iconColor, 13)}` }}>
                <Icon size={16} aria-hidden="true" style={{ color: c.iconColor }} />
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
    </section>
  )
}
