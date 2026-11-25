import type { ReactNode } from 'react'
import { TrendingUp, Landmark, TrendingDown, Coins, Zap, LayoutGrid, Info, type LucideIcon } from 'lucide-react'
import { SALE_COUNTERPARTS, type HistoryStats, type SummaryCard as Card } from '../../api/portfolio'
import { formatNumber, type Currency } from '../../utils/format'
import { T } from '../../utils/colors'
import { StatCard, StatChip } from '../../components/ui'
import { CARD_TITLES, COUNTERPART_LABELS, chipTarjeta, count, marginNotice, moneyIn, netLine, opsTarjeta, signedMoney } from './stats/summaryText'

const CARD_META: Record<Card, { icon: LucideIcon; color: string }> = {
  invertido:  { icon: TrendingUp,   color: T.positive },
  retirado:   { icon: Landmark,     color: T.purple },
  ventas:     { icon: TrendingDown, color: T.brand },
  ingresos:   { icon: Coins,        color: T.info },
  comisiones: { icon: Zap,          color: T.warning },
}

const CLICK_HINT = 'Pulsa la tarjeta para ver sus operaciones en la lista.'

/**
 * Resumen del Historial sobre lo filtrado (#346, #376): cinco tarjetas de tres
 * huecos (#490, #553) con su cifra, un chip con las operaciones que la forman
 * (las mismas que filtra la tarjeta al pulsarla) y su mini gráfica del
 * periodo; netos y desgloses van en la ayuda de cada una (#407). El margen
 * (#403) se incluye o excluye en Opciones de vista; aquí queda su aviso con un
 * enlace para cambiarlo.
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
      <p>Sin filtros, el neto coincide con «EUR neto» del Dashboard.</p>
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
      {totals.fees_in_price_ops > 0 && (
        <p>Además, {count(totals.fees_in_price_ops, 'operación lleva', 'operaciones llevan')} la comisión dentro del precio (Convert, compras con tarjeta…): el exchange no la desglosa y no está en la cifra.</p>
      )}
    </> },
  ]

  return (
    <section aria-labelledby="historial-resumen">
      {/* Cabecera de bloque (#553): título con su icono y los recuentos como chips. */}
      <div className="flex flex-wrap items-center gap-2 mb-2.5">
        <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-md bg-brand/10 text-brand-ink"><LayoutGrid size={13} /></span>
        <h2 id="historial-resumen" className="text-[11px] font-semibold text-fg-muted uppercase tracking-widest">Resumen</h2>
        <StatChip>{count(totals.ops, 'operación', 'operaciones')}</StatChip>
        <StatChip>{count(totals.unique_assets, 'activo', 'activos')}</StatChip>
        {filtered && <span className="text-xs text-fg-subtle">según los filtros</span>}
      </div>
      {notice && (
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-border bg-overlay/3 px-3 py-2 text-xs text-fg-muted" role="status">
          <Info size={13} aria-hidden="true" className="mt-px shrink-0 text-info-ink" />
          <span>
            {notice}{' '}
            <button type="button" onClick={() => onIncludeMargin(!margin.included)}
              className="font-medium text-brand-ink hover:underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand rounded">
              {margin.included ? 'Excluirlas' : 'Incluirlas'}
            </button>
          </span>
        </p>
      )}
      {/* En móvil, la quinta tarjeta ocupa toda la fila: sin hueco al final. */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 max-md:[&>*:last-child:nth-child(odd)]:col-span-2">
        {cards.map((c, i) => (
          <StatCard key={c.id} title={CARD_TITLES[c.id]} icon={CARD_META[c.id].icon} color={CARD_META[c.id].color}
            value={c.value[currency]} format={format} series={series.map(s => s.valor[c.id][currency])} reserveSlots
            vacia={opsTarjeta(c.id, totals) === 0}
            chip={card === c.id
              ? <StatChip color={CARD_META[c.id].color}>Filtrando: {chipTarjeta(c.id, opsTarjeta(c.id, totals)).toLowerCase()}</StatChip>
              : <StatChip tone={opsTarjeta(c.id, totals) === 0 ? 'muted' : 'neutral'}>{chipTarjeta(c.id, opsTarjeta(c.id, totals))}</StatChip>}
            active={card === c.id} onSelect={() => onSelectCard(card === c.id ? '' : c.id)} delay={i * 60}
            actionLabel={`${chipTarjeta(c.id, opsTarjeta(c.id, totals))}. ${card === c.id ? 'Quitar el filtro de sus operaciones' : 'Ver sus operaciones'}`}
            helpLabel={`Qué suma ${CARD_TITLES[c.id]}`}
            help={<>{c.help}<p className="text-fg-muted">{CLICK_HINT}</p></>} />
        ))}
      </div>
    </section>
  )
}
