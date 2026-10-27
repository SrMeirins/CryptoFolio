import type { ReactNode } from 'react'
import { TrendingUp, BarChart2, Zap, TrendingDown, Coins } from 'lucide-react'
import { SALE_COUNTERPARTS, type HistoryStats } from '../../api/portfolio'
import { InfoTooltip } from '../../components/InfoTooltip'
import { formatNumber, type Currency } from '../../utils/format'
import { T, alpha } from '../../utils/colors'
import { COUNTERPART_LABELS, count, marginNotice, moneyIn, netLine, signedMoney } from './stats/summaryText'

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
 * Cada tarjeta explica qué suma y el resumen puede excluir el margen (#403).
 */
export function StatsBar({ totals, currency, filtered, margin, onIncludeMargin }: {
  totals: HistoryStats['totals']
  currency: Currency
  filtered: boolean
  margin: HistoryStats['margin']
  onIncludeMargin: (include: boolean) => void
}) {
  const money = (v: { EUR: number; USD: number }) => moneyIn(v, currency)
  const sinPrecio = (n: number) => (n > 0 ? ` · ${formatNumber(n, 0)} sin precio` : '')
  const gp = totals.sold_gp[currency]
  const net = netLine(totals, currency)
  const notice = marginNotice(margin)

  const cards: { meta: (typeof CARD_META)[keyof typeof CARD_META]; title: string; value: string; sub: ReactNode; help: ReactNode }[] = [
    { meta: CARD_META.invested, title: 'Invertido', value: money(totals.invested),
      sub: <>{count(totals.fiat_buys, 'compra con fiat', 'compras con fiat')}{net && <span className="block">{net}</span>}</>,
      help: <>
        <p>Fiat entregado a cambio de cripto: las compras pagadas con fiat, también las que el exchange registra como venta de fiat.</p>
        <p>El neto resta el fiat recibido al vender cripto. Sin filtros coincide con «EUR neto en cripto» del Dashboard, que mide lo depositado menos lo retirado al banco; la diferencia es el cashback y el fiat que aún no se ha invertido.</p>
      </> },
    { meta: CARD_META.ops, title: 'Operaciones', value: formatNumber(totals.ops, 0),
      sub: `${count(totals.unique_assets, 'activo', 'activos')} · ${count(totals.manual, 'manual', 'manuales')}`,
      help: <p>Filas de la lista según los filtros. Con las comisiones agrupadas, la comisión de una compra o venta cuenta dentro de ella.</p> },
    { meta: CARD_META.income, title: 'Ingresos', value: money(totals.income),
      sub: count(totals.income_ops, 'ingreso', 'ingresos') + sinPrecio(totals.income_sin_valor),
      help: <p>Staking, recompensas, intereses, cashback y airdrops, a su valor de mercado en la fecha en que se reciben.</p> },
    { meta: CARD_META.fees, title: 'Comisiones', value: money(totals.fees),
      sub: count(totals.fee_ops, 'operación con comisión', 'operaciones con comisión') + sinPrecio(totals.fees_sin_valor),
      help: <p>Todas las comisiones cobradas en lo filtrado (las de cada operación y las filas de comisión del exchange), valoradas con el FIFO. No incluye las que el exchange ya suma al coste de la compra.</p> },
    { meta: CARD_META.sells, title: 'Ventas', value: money(totals.sold),
      sub: <>{count(totals.sells, 'venta', 'ventas')} · <span className={gp > 0 ? 'text-positive-ink' : gp < 0 ? 'text-negative-ink' : ''}>G/P {signedMoney(gp, currency)}</span></>,
      help: <>
        <p>Valor de transmisión de lo vendido, que es lo que se declara, y su resultado según el FIFO. Incluye las ventas que el exchange registra como compra de fiat.</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          {SALE_COUNTERPARTS.map(k => (
            <div key={k} className="contents">
              <dt className="text-fg-muted">{COUNTERPART_LABELS[k]}</dt>
              <dd className="mono text-right">{count(totals.sold_by_counterpart[k].ops, 'venta', 'ventas')} · {money(totals.sold_by_counterpart[k].value)}</dd>
            </div>
          ))}
        </dl>
      </> },
  ]

  return (
    <section aria-labelledby="historial-resumen">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 id="historial-resumen" className="text-[11px] text-fg-subtle uppercase tracking-widest">
          Resumen{filtered && <span className="normal-case tracking-normal"> · según los filtros</span>}
        </h2>
        <label className="inline-flex items-center gap-2 text-xs text-fg-muted cursor-pointer">
          <input type="checkbox" role="switch" checked={margin.included} onChange={e => onIncludeMargin(e.target.checked)}
            className="peer sr-only" />
          <span aria-hidden="true"
            className="relative w-7 h-4 rounded-full bg-overlay/15 transition-colors peer-checked:bg-brand-solid peer-focus-visible:ring-2 peer-focus-visible:ring-brand/60 after:absolute after:top-0.5 after:left-0.5 after:w-3 after:h-3 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-3" />
          Incluir margen
        </label>
      </div>
      {notice && <p className="text-xs text-fg-subtle mb-2" role="status">{notice}</p>}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {cards.map(c => {
          const Icon = c.meta.icon
          return (
            <div key={c.title} className="rounded-xl p-4 flex items-center gap-3 border"
              style={{ backgroundColor: c.meta.bg, borderColor: c.meta.border }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${alpha(c.meta.iconColor, 13)}` }}>
                <Icon size={16} aria-hidden="true" style={{ color: c.meta.iconColor }} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] text-fg-subtle uppercase tracking-widest">
                  <span>{c.title}</span>
                  <InfoTooltip label={`Qué suma ${c.title}`}>{c.help}</InfoTooltip>
                </div>
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
