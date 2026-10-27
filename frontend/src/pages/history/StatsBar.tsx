import type { ReactNode } from 'react'
import { TrendingUp, Landmark, TrendingDown, Coins, Zap, type LucideIcon } from 'lucide-react'
import { SALE_COUNTERPARTS, type HistoryStats, type SummaryCard as Card } from '../../api/portfolio'
import { formatNumber, type Currency } from '../../utils/format'
import { T } from '../../utils/colors'
import { StatCard } from '../../components/ui'
import { CARD_TITLES, COUNTERPART_LABELS, count, marginNotice, moneyIn, netLine, signedMoney } from './stats/summaryText'

const CARD_META: Record<Card, { icon: LucideIcon; color: string }> = {
  invertido:  { icon: TrendingUp,   color: T.positive },
  retirado:   { icon: Landmark,     color: T.purple },
  ventas:     { icon: TrendingDown, color: T.brand },
  ingresos:   { icon: Coins,        color: T.info },
  comisiones: { icon: Zap,          color: T.warning },
}

const CLICK_HINT = 'Pulsa la tarjeta para ver sus operaciones en la lista.'

/**
 * Resumen del Historial sobre lo filtrado (#346, #376): cinco tarjetas con su
 * cifra y su mini gráfica; recuentos, netos y desgloses van en la ayuda de
 * cada una (#407). Pueden excluir el margen (#403) y filtrar la lista.
 */
export function StatsBar({ totals, series, currency, filtered, margin, onIncludeMargin, card, onSelectCard }: {
  totals: HistoryStats['totals']
  series: HistoryStats['series']
  currency: Currency
  filtered: boolean
  margin: HistoryStats['margin']
  onIncludeMargin: (include: boolean) => void
  card: Card | ''
  onSelectCard: (card: Card | '') => void
}) {
  const money = (v: { EUR: number; USD: number }) => moneyIn(v, currency)
  const format = (v: number) => money({ EUR: v, USD: v })
  const sinPrecio = (n: number) => (n > 0 ? ` (${formatNumber(n, 0)} sin precio)` : '')
  const net = netLine(totals, currency)
  const notice = marginNotice(margin)
  const bankNet = { EUR: totals.deposited.EUR - totals.withdrawn.EUR, USD: totals.deposited.USD - totals.withdrawn.USD }

  const cards: { id: Card; value: { EUR: number; USD: number }; help: ReactNode }[] = [
    { id: 'invertido', value: totals.invested, help: <>
      <p>Fiat entregado a cambio de cripto: {count(totals.fiat_buys, 'compra', 'compras')}, también las que el exchange registra como venta de fiat.</p>
      {net && <p>{net}: resta el fiat recibido al vender cripto.</p>}
    </> },
    { id: 'retirado', value: totals.withdrawn, help: <>
      <p>Fiat retirado al banco o a tarjeta: {count(totals.withdrawn_ops, 'retirada', 'retiradas')}.</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-fg-muted">Depositado</dt><dd className="mono text-right">{money(totals.deposited)}</dd>
        <dt className="text-fg-muted">Retirado</dt><dd className="mono text-right">{money(totals.withdrawn)}</dd>
        <dt className="text-fg-muted">Neto en cripto</dt><dd className="mono text-right">{money(bankNet)}</dd>
      </dl>
      <p>Sin filtros, el neto coincide con «EUR neto en cripto» del Dashboard.</p>
    </> },
    { id: 'ventas', value: totals.sold, help: <>
      <p>Valor de lo vendido a fiat o a stablecoin: {count(totals.sells, 'venta', 'ventas')}, con un resultado de {signedMoney(totals.sold_gp[currency], currency)} según el FIFO.</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {SALE_COUNTERPARTS.map(k => (
          <div key={k} className="contents">
            <dt className="text-fg-muted">{COUNTERPART_LABELS[k]}</dt>
            <dd className="mono text-right">{count(totals.sold_by_counterpart[k].ops, 'venta', 'ventas')} · {money(totals.sold_by_counterpart[k].value)}</dd>
          </div>
        ))}
      </dl>
      <p>Pasar una stablecoin a fiat no se suma: su valor ya se contó al vender la cripto por ella
        {totals.stable_to_fiat.ops > 0 && <> ({count(totals.stable_to_fiat.ops, 'conversión', 'conversiones')} · {money(totals.stable_to_fiat.value)})</>}.
        Fiscal sí la declara.</p>
    </> },
    { id: 'ingresos', value: totals.income, help:
      <p>Staking, recompensas, intereses, cashback y airdrops a su valor de mercado al recibirlos: {count(totals.income_ops, 'ingreso', 'ingresos')}{sinPrecio(totals.income_sin_valor)}.</p> },
    { id: 'comisiones', value: totals.fees, help: <>
      <p>Comisiones cobradas, valoradas con el FIFO: {count(totals.fee_ops, 'comisión', 'comisiones')}{sinPrecio(totals.fees_sin_valor)}.</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-fg-muted">Cobradas aparte</dt>
        <dd className="mono text-right">{count(totals.fee_ops - totals.fees_included.ops, 'comisión', 'comisiones')} · {money({ EUR: totals.fees.EUR - totals.fees_included.value.EUR, USD: totals.fees.USD - totals.fees_included.value.USD })}</dd>
        <dt className="text-fg-muted">Incluidas en el coste</dt>
        <dd className="mono text-right">{count(totals.fees_included.ops, 'comisión', 'comisiones')} · {money(totals.fees_included.value)}</dd>
      </dl>
      <p>Las incluidas en el coste ya forman parte del precio de compra: se muestran, pero no se descuentan otra vez.</p>
    </> },
  ]

  return (
    <section aria-labelledby="historial-resumen">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 id="historial-resumen" className="text-[11px] text-fg-subtle uppercase tracking-widest">
          Resumen
          <span className="normal-case tracking-normal"> · {count(totals.ops, 'operación', 'operaciones')} · {count(totals.unique_assets, 'activo', 'activos')}{filtered && ' · según los filtros'}</span>
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
        {cards.map((c, i) => (
          <StatCard key={c.id} title={CARD_TITLES[c.id]} icon={CARD_META[c.id].icon} color={CARD_META[c.id].color}
            value={c.value[currency]} format={format} series={series.map(s => s.valor[c.id][currency])}
            active={card === c.id} onSelect={() => onSelectCard(card === c.id ? '' : c.id)} delay={i * 60}
            actionLabel={card === c.id ? 'Quitar el filtro de sus operaciones' : 'Ver sus operaciones'}
            helpLabel={`Qué suma ${CARD_TITLES[c.id]}`}
            help={<>{c.help}<p className="text-fg-muted">{CLICK_HINT}</p></>} />
        ))}
      </div>
    </section>
  )
}
