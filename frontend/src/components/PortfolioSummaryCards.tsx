import type { ReactNode } from 'react'
import { Wallet, Receipt, TrendingUp, TrendingDown, Percent, Landmark } from 'lucide-react'
import { StatCard } from './ui'
import { Change24hChip, type Change24h } from './Change24hChip'
import { formatMoney, type Currency, formatPercent } from '../utils/format'
import { costSecondary, returnSecondary } from '../utils/summaryCards'
import { todayChip } from '../utils/windowChip'
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

/**
 * Las 4-5 tarjetas de resumen del Dashboard (Valor actual / Coste / P&L /
 * Rentabilidad / EUR neto) con el estilo común StatCard (#412): solo la cifra,
 * como mucho un chip (24 h en Valor, Hoy en P&L) y el resto del texto en la
 * ayuda. El color sigue el significado: P&L y Rentabilidad, el de su signo.
 */
export function PortfolioSummaryCards({
  totalValue, totalCost, pnl, pnlPct, hasPrices, loading,
  valueTooltip, costTooltip, pnlTooltip, pnlPctTooltip,
  eurFlow, eurFlowTooltip,
  change24h, currency = 'EUR', assetCount, todayPnl = null, todayPending = false,
  valueTrend = [], pnlTrend = [], returnTrend = [], targets,
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
  /** P&L de hoy en vivo (#213), en `currency`; null mientras no hay dato. */
  todayPnl?: number | null
  /** Aún se preparan los históricos: «Calculando…» en lugar del P&L de hoy (#334). */
  todayPending?: boolean
  /** Últimos 30 días de la serie diaria para las mini gráficas (#251, #412). */
  valueTrend?: readonly number[]
  pnlTrend?: readonly number[]
  returnTrend?: readonly number[]
  targets: SummaryCardTargets
}) {
  // Las tarjetas llevan la moneda en la key: al cambiarla se remontan en vez de
  // animar la cifra de un importe en EUR a uno en USD.
  const money = (v: number) => formatMoney(v, currency)
  const signedMoney = (v: number) => (v >= 0 ? '+' : '') + money(v)
  // El flujo de EUR llega del backend con su propia moneda; se formatea con ella.
  const flowCurrency = eurFlow?.currency ?? currency
  const flowMoney = (v: number) => formatMoney(v, flowCurrency)
  const today = todayChip(todayPnl, currency)
  const pnlColor = hasPrices ? (pnl >= 0 ? T.positive : T.negative) : T.muted
  const pctColor = hasPrices ? (pnlPct >= 0 ? T.positive : T.negative) : T.muted
  const trend = (s: readonly number[]) => (hasPrices && s.length > 1 ? s : undefined)

  return (
    // Ancho mínimo por tarjeta y paso a la fila siguiente según el espacio real
    // (descontando la barra lateral) (#152).
    <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(13.5rem,1fr))]">
      <StatCard
        key={`value-${currency}`}
        title="Valor" icon={Wallet} color={T.brand}
        value={hasPrices ? totalValue : '—'} format={money} flash loading={loading}
        chip={change24h && <Change24hChip change={change24h} />}
        series={trend(valueTrend)}
        help={valueTooltip}
        onSelect={targets.portfolio} actionLabel="Ver el inventario en Portfolio" delay={0}
      />

      <StatCard
        key={`cost-${currency}`}
        title="Coste" icon={Receipt} color={T.muted}
        value={totalCost} format={money} flash loading={loading}
        help={<>{costTooltip}<p className="text-fg-muted">{costSecondary(assetCount)}.</p></>}
        onSelect={targets.portfolio} actionLabel="Ver el inventario en Portfolio" delay={60}
      />

      <StatCard
        key={`pnl-${currency}`}
        title="P&L no realizado" icon={hasPrices && pnl < 0 ? TrendingDown : TrendingUp} color={pnlColor}
        value={hasPrices ? pnl : '—'} format={signedMoney} tone={hasPrices ? sign(pnl) : undefined} flash loading={loading}
        chip={todayPending ? <PreparandoHistoricos datos={undefined} compacto /> : today && (
          <WindowChip window="today" tone={today.tone} triggerLabel={today.aria}>{today.text}</WindowChip>
        )}
        series={trend(pnlTrend)}
        help={pnlTooltip}
        onSelect={targets.portfolio} actionLabel="Ver el inventario en Portfolio" delay={120}
      />

      <StatCard
        key={`pct-${currency}`}
        title="Rentabilidad" icon={Percent} color={pctColor}
        value={hasPrices ? pnlPct : '—'} format={v => formatPercent(v, 2, true)} tone={hasPrices ? sign(pnlPct) : undefined} flash loading={loading}
        series={trend(returnTrend)}
        help={<>{pnlPctTooltip}<p className="text-fg-muted">{returnSecondary(totalCost, currency)}.</p></>}
        onSelect={targets.evolution} actionLabel="Ir al gráfico de evolución" delay={180}
      />

      {eurFlow && (
        <StatCard
          key={`flow-${flowCurrency}`}
          title={flowCurrency === 'EUR' ? 'EUR neto' : 'Neto aportado'} icon={Landmark} color={T.purple}
          value={eurFlow.netFromBank} format={flowMoney} loading={loading}
          help={eurFlowTooltip}
          onSelect={targets.withdrawn} actionLabel="Ver las retiradas en el Historial" delay={240}
        />
      )}
    </div>
  )
}
