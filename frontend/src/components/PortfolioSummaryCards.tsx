import { type ReactNode } from 'react'
import { MetricCard, type Change24h } from './MetricCard'
import { formatMoney, type Currency } from '../utils/format'

interface EurFlow {
  deposited:    number
  withdrawn:    number
  netFromBank:  number
  currency?:    Currency
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
  change24h, currency = 'EUR',
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
}) {
  // Las tarjetas llevan la moneda en la key: al cambiarla se remontan en vez de
  // animar la cifra de un importe en EUR a uno en USD.
  const money = (v: number) => formatMoney(v, currency)
  // El flujo de EUR llega del backend con su propia moneda; se formatea con ella.
  const flowCurrency = eurFlow?.currency ?? currency
  const flowMoney = (v: number) => formatMoney(v, flowCurrency)
  return (
    // Ancho mínimo por tarjeta y paso a la fila siguiente según el espacio real
    // (descontando la barra lateral): antes las columnas dependían del ancho de
    // la ventana y a 1024 px los valores desbordaban la tarjeta (#152).
    <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(13.5rem,1fr))]">
      <MetricCard
        key={`value-${currency}`}
        label="Valor"
        value={hasPrices ? money(totalValue) : '—'}
        rawValue={hasPrices ? totalValue : undefined}
        format={money}
        loading={loading}
        change24h={change24h}
        tooltip={valueTooltip}
      />

      <MetricCard
        key={`cost-${currency}`}
        label="Coste de adquisición"
        value={money(totalCost)}
        rawValue={totalCost}
        format={money}
        loading={loading}
        tooltip={costTooltip}
      />

      <MetricCard
        key={`pnl-${currency}`}
        label="P&L no realizado"
        value={hasPrices ? (pnl >= 0 ? '+' : '') + money(pnl) : '—'}
        rawValue={hasPrices ? pnl : undefined}
        format={v => (v >= 0 ? '+' : '') + money(v)}
        positive={hasPrices ? pnl >= 0 : undefined}
        loading={loading}
        tooltip={pnlTooltip}
      />

      <MetricCard
        key={`pct-${currency}`}
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
        key={`flow-${flowCurrency}`}
          label={flowCurrency === 'EUR' ? 'EUR neto en cripto' : 'Neto en cripto'}
          value={flowMoney(eurFlow.netFromBank)}
          rawValue={eurFlow.netFromBank}
          format={flowMoney}
          loading={loading}
          tooltip={eurFlowTooltip}
        />
      )}
    </div>
  )
}
