import { type ReactNode } from 'react'
import { MetricCard, type Change24h } from './MetricCard'
import { formatEur } from '../utils/format'

interface EurFlow {
  deposited:    number
  withdrawn:    number
  netFromBank:  number
}

/**
 * Las 4-5 tarjetas de resumen del Dashboard (Valor actual / Coste / P&L /
 * Rentabilidad / EUR neto). Portfolio dejó de mostrarlas para no duplicar
 * información (#151). El contenido de cada tooltip se recibe como prop.
 */
export function PortfolioSummaryCards({
  totalValue, totalCost, pnl, pnlPct, hasPrices, loading,
  valueTooltip, costTooltip, pnlTooltip, pnlPctTooltip,
  eurFlow, eurFlowTooltip,
  change24h,
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
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      <MetricCard
        label="Valor actual"
        value={hasPrices ? formatEur(totalValue) : '—'}
        rawValue={hasPrices ? totalValue : undefined}
        format={formatEur}
        loading={loading}
        change24h={change24h}
        tooltip={valueTooltip}
      />

      <MetricCard
        label="Coste de adquisición"
        value={formatEur(totalCost)}
        rawValue={totalCost}
        format={formatEur}
        loading={loading}
        tooltip={costTooltip}
      />

      <MetricCard
        label="P&L no realizado"
        value={hasPrices ? (pnl >= 0 ? '+' : '') + formatEur(pnl) : '—'}
        rawValue={hasPrices ? pnl : undefined}
        format={v => (v >= 0 ? '+' : '') + formatEur(v)}
        positive={hasPrices ? pnl >= 0 : undefined}
        loading={loading}
        tooltip={pnlTooltip}
      />

      <MetricCard
        label="Rentabilidad"
        value={hasPrices ? (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(2) + '%' : '—'}
        rawValue={hasPrices ? pnlPct : undefined}
        format={v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%'}
        positive={hasPrices ? pnlPct >= 0 : undefined}
        loading={loading}
        tooltip={pnlPctTooltip}
      />

      {eurFlow && (
        <MetricCard
          label="EUR neto en cripto"
          value={formatEur(eurFlow.netFromBank)}
          rawValue={eurFlow.netFromBank}
          format={formatEur}
          loading={loading}
          tooltip={eurFlowTooltip}
        />
      )}
    </div>
  )
}
