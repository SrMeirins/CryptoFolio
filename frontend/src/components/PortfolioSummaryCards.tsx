import type { ReactNode } from 'react'
import { Wallet, Receipt, TrendingUp, TrendingDown, Percent, Landmark } from 'lucide-react'
import { StatCard } from './ui'
import { Change24hChip, type Change24h } from './Change24hChip'
import { formatMoney, type Currency, formatPercent } from '../utils/format'
import { costChip, costSecondary, pnlPctChip, returnSecondary, todayPctChip, withdrawnChip } from '../utils/summaryCards'
import { T } from '../utils/colors'
import { PreparandoHistoricos } from './PreparandoHistoricos'
import { WindowChip } from './WindowChip'

interface EurFlow {
  deposited:    number
  withdrawn:    number
  netFromBank:  number
  currency?:    Currency
}

/** Destinos de las tarjetas clicables (#412). */
export interface SummaryCardTargets {
  /** Valor, Coste y P&L: el inventario en Portfolio. */
  portfolio: () => void
  /** Rentabilidad: el gráfico de evolución del Dashboard. */
  evolution: () => void
  /** EUR neto: el Historial con la tarjeta Retirado. */
  withdrawn: () => void
}

const sign = (n: number): 'positive' | 'negative' => (n >= 0 ? 'positive' : 'negative')

const CHIP_TONES = {
  positive: 'bg-positive/8 border-positive/25 text-positive-ink',
  negative: 'bg-negative/8 border-negative/25 text-negative-ink',
  neutral: 'border-border text-fg-muted',
} as const

/** Chip estático de contexto (#507), con el mismo aspecto que los de ventana. */
function KpiChip({ children, tone = 'neutral' }: { children: ReactNode; tone?: keyof typeof CHIP_TONES }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-lg border text-xs leading-none whitespace-nowrap mono font-semibold ${CHIP_TONES[tone]}`}>
      {children}
    </span>
  )
}

// Ancho de cada tarjeta según el ancho del contenedor (#507): 5 en fila en
// grande, 3 y 2 en medio y 2 por fila en estrecho; con `grow`, las de la
// última fila se estiran y no quedan huecos.
const CARD_WIDTH = 'grow basis-[calc(50%-0.375rem)] @3xl:basis-[calc(33.333%-0.5rem)] @6xl:basis-[calc(20%-0.6rem)] min-w-0'

/**
 * Las 4-5 tarjetas de resumen del Dashboard (Valor actual / Coste / P&L /
 * Rentabilidad / EUR neto) con la StatCard común de tres huecos (#412, #507):
 * cifra, un chip de contexto y la mini gráfica de 30 días, con los huecos
 * reservados para que la fila quede alineada aunque falte un dato. El resto
 * del texto va en la ayuda. El color sigue el significado.
 */
export function PortfolioSummaryCards({
  totalValue, totalCost, pnl, pnlPct, hasPrices, loading,
  valueTooltip, costTooltip, pnlTooltip, pnlPctTooltip,
  eurFlow, eurFlowTooltip,
  change24h, currency = 'EUR', assetCount, todayPct = null, todayPending = false,
  valueTrend = [], costTrend = [], pnlTrend = [], returnTrend = [], eurNetTrend = [], targets,
}: {
  totalValue: number
  totalCost:  number
  pnl:        number
  pnlPct:     number
  hasPrices:  boolean
  loading:    boolean
  valueTooltip:  ReactNode
  costTooltip:   ReactNode
  pnlTooltip:    ReactNode
  pnlPctTooltip: ReactNode
  eurFlow?: EurFlow | null
  eurFlowTooltip?: ReactNode
  change24h?: Change24h
  currency?: Currency
  assetCount: number
  /** Rentabilidad de hoy en vivo (#213, #507), en %; null mientras no hay dato. */
  todayPct?: number | null
  /** Aún se preparan los históricos: «Calculando…» en lugar del P&L de hoy (#334). */
  todayPending?: boolean
  /** Últimos 30 días de la serie diaria para las mini gráficas (#251, #412). */
  valueTrend?: readonly number[]
  /** Coste y EUR neto de cada día, de la API (#507). */
  costTrend?: readonly number[]
  pnlTrend?: readonly number[]
  returnTrend?: readonly number[]
  eurNetTrend?: readonly number[]
  targets: SummaryCardTargets
}) {
  // Las tarjetas llevan la moneda en la key: al cambiarla se remontan en vez de
  // animar la cifra de un importe en EUR a uno en USD.
  const money = (v: number) => formatMoney(v, currency)
  const signedMoney = (v: number) => (v >= 0 ? '+' : '') + money(v)
  // El flujo de EUR llega del backend con su propia moneda; se formatea con ella.
  const flowCurrency = eurFlow?.currency ?? currency
  const flowMoney = (v: number) => formatMoney(v, flowCurrency)
  const today = todayPctChip(todayPct)
  const pnlChip = hasPrices ? pnlPctChip(pnlPct) : null
  const pnlColor = hasPrices ? (pnl >= 0 ? T.positive : T.negative) : T.muted
  const pctColor = hasPrices ? (pnlPct >= 0 ? T.positive : T.negative) : T.muted
  const trend = (s: readonly number[]) => (hasPrices && s.length > 1 ? s : undefined)
  // Coste y EUR neto no dependen de los precios en vivo.
  const realTrend = (s: readonly number[]) => (s.length > 1 ? s : undefined)

  return (
    // Ancho mínimo por tarjeta y paso a la fila siguiente según el espacio real
    // (descontando la barra lateral) (#152).
    <div className="@container" data-testid="kpi-cards">
    <div className="flex flex-wrap gap-3">
      <StatCard
        key={`value-${currency}`}
        title="Valor" icon={Wallet} color={T.brand}
        value={hasPrices ? totalValue : '—'} format={money} flash loading={loading} reserveSlots className={CARD_WIDTH}
        chip={change24h && <Change24hChip change={change24h} />}
        series={trend(valueTrend)}
        help={valueTooltip}
        onSelect={targets.portfolio} actionLabel="Ver el inventario en Portfolio" delay={0}
      />

      <StatCard
        key={`cost-${currency}`}
        title="Coste" icon={Receipt} color={T.muted}
        value={totalCost} format={money} flash loading={loading} reserveSlots className={CARD_WIDTH}
        chip={<KpiChip>{costChip(assetCount)}</KpiChip>}
        series={realTrend(costTrend)}
        help={<>{costTooltip}<p className="text-fg-muted">{costSecondary(assetCount)}.</p></>}
        onSelect={targets.portfolio} actionLabel="Ver el inventario en Portfolio" delay={60}
      />

      <StatCard
        key={`pnl-${currency}`}
        title="P&L no realizado" icon={hasPrices && pnl < 0 ? TrendingDown : TrendingUp} color={pnlColor}
        value={hasPrices ? pnl : '—'} format={signedMoney} tone={hasPrices ? sign(pnl) : undefined} flash loading={loading} reserveSlots className={CARD_WIDTH}
        chip={pnlChip && <KpiChip tone={pnlChip.tone}>{pnlChip.text}</KpiChip>}
        series={trend(pnlTrend)}
        help={pnlTooltip}
        onSelect={targets.portfolio} actionLabel="Ver el inventario en Portfolio" delay={120}
      />

      <StatCard
        key={`pct-${currency}`}
        title="Rentabilidad" icon={Percent} color={pctColor}
        value={hasPrices ? pnlPct : '—'} format={v => formatPercent(v, 2, true)} tone={hasPrices ? sign(pnlPct) : undefined} flash loading={loading}
        reserveSlots className={CARD_WIDTH}
        chip={todayPending ? <PreparandoHistoricos datos={undefined} compacto /> : today && (
          <WindowChip window="today" tone={today.tone} triggerLabel={today.aria}>{today.text}</WindowChip>
        )}
        series={trend(returnTrend)}
        help={<>{pnlPctTooltip}<p className="text-fg-muted">{returnSecondary(totalCost, currency)}.</p></>}
        onSelect={targets.evolution} actionLabel="Ir al gráfico de evolución" delay={180}
      />

      {eurFlow && (
        <StatCard
          key={`flow-${flowCurrency}`}
          title={flowCurrency === 'EUR' ? 'EUR neto' : 'Neto aportado'} icon={Landmark} color={T.purple}
          value={eurFlow.netFromBank} format={flowMoney} loading={loading} reserveSlots className={CARD_WIDTH}
          chip={<KpiChip>{withdrawnChip(eurFlow.withdrawn, flowCurrency)}</KpiChip>}
          series={realTrend(eurNetTrend)}
          help={eurFlowTooltip}
          onSelect={targets.withdrawn} actionLabel="Ver las retiradas en el Historial" delay={240}
        />
      )}
    </div>
    </div>
  )
}
