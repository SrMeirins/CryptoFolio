import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
import { usePricesStore } from '../store/pricesStore'
import { formatMoney, formatMoneyCompact, formatPercent } from '../utils/format'
import { type Change24h } from '../components/MetricCard'
import { PortfolioSummaryCards } from '../components/PortfolioSummaryCards'
import { usePortfolioValuation } from '../hooks/usePortfolioValuation'
import { useDisplayMarket } from '../hooks/useDisplayMarket'
import { useCurrencyQuery } from '../hooks/useCurrencyQuery'
import { LIVE_STATUS_META, useLiveStatus } from '../hooks/useLiveStatus'
import { dailyPnlQuery, eurFlowQuery } from '../queries/currencyQueries'
import { computeChange24h } from '../utils/change24h'
import { TopMovers } from './dashboard/TopMovers'
import { RecentActivity } from './dashboard/RecentActivity'
import { EvolutionCard } from './dashboard/EvolutionCard'
import { PnlCalendar } from './dashboard/PnlCalendar'
import { AllocationChart } from './dashboard/AllocationChart'
import { FiscalCard } from './dashboard/FiscalCard'
import { madridToday } from '../utils/pnlChart'
import { monthRange, ymOf } from '../utils/pnlCalendar'
import { useLiveDayPnl } from '../hooks/useLiveDayPnl'

export function Dashboard() {
  // Precios en la moneda de visualización (#177): en USD sin USDT aún, vacíos.
  const { currency, prices, open24, fiatOpen24 } = useDisplayMarket()
  const live = LIVE_STATUS_META[useLiveStatus()]
  const lastUpdate = usePricesStore((s) => s.lastUpdate)

  const { data: lots = [], isLoading: lotsLoading } = useQuery({
    queryKey: ['fifo-lots'],
    queryFn: portfolioApi.getLots,
    refetchInterval: 60_000,
  })

  const { data: fiscal = [] } = useQuery({
    queryKey: ['fiscal-summary'],
    queryFn: portfolioApi.getFiscalSummary,
  })

  const { data: fiatBalances = [] } = useQuery({
    queryKey: ['fiat-balances'],
    queryFn: portfolioApi.getFiatBalances,
    refetchInterval: 60_000,
  })

  const { data: eurFlow } = useCurrencyQuery(eurFlowQuery)
  const flowCurrency = eurFlow?.currency ?? currency


  const {
    assets, cryptoValue, fiatValue: totalFiat, totalValue, totalCost,
    pnl: totalPnl, pnlPct: totalPnlPct, assetCount,
  } = usePortfolioValuation(lots, fiatBalances)

  // «Hoy» de la tarjeta de P&L (#210): misma consulta (y caché) que el mes en
  // curso del calendario y mismo cálculo en vivo, así que ambas cifras coinciden.
  const today = madridToday()
  const month = monthRange(ymOf(today), today)
  const { data: monthPnl } = useCurrencyQuery(
    c => dailyPnlQuery(c, month?.from, month?.to),
    { refetchInterval: 60_000, enabled: month !== null },
  )
  const liveToday = useLiveDayPnl(monthPnl?.currency === currency ? monthPnl.today : null, currency)
  const hasPrices = Object.keys(prices).length > 0

  // Variación de 24h en tiempo real con el precio de hace 24h del WebSocket (#147).
  const change24h = useMemo((): Change24h => {
    const waiting = 'Esperando los precios en vivo. Aparecerá en cuanto llegue el primer dato.'
    if (!hasPrices) return { kind: 'unavailable', reason: waiting }
    const result = computeChange24h(assets, open24, fiatOpen24)
    if (result.status === 'unavailable') {
      return {
        kind: 'unavailable',
        reason: result.reason === 'no-prices' ? waiting : 'Aún no se ha recibido el precio de hace 24h de Binance.',
      }
    }
    return {
      kind: 'value',
      eur: (result.eur >= 0 ? '+' : '') + formatMoney(result.eur, currency),
      pct: formatPercent(result.pct, 2, true),
      eurCompact: (result.eur >= 0 ? '+' : '') + formatMoneyCompact(result.eur, currency),
      pctCompact: formatPercent(result.pct, 1, true),
      positive: result.eur >= 0,
      note: result.excluded.length > 0
        ? <p>Sin precio de hace 24h, excluidos del cálculo: <span className="mono text-fg">{result.excluded.join(', ')}</span></p>
        : undefined,
    }
  }, [assets, open24, fiatOpen24, hasPrices, currency])

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-fg-subtle text-sm mt-1">
            {lastUpdate ? `Actualizado ${lastUpdate.toLocaleTimeString('es-ES')}` : 'Cargando precios...'}
          </p>
        </div>
        <div className="flex items-center gap-2" title={live.title}>
          <div className={`w-2 h-2 rounded-full ${live.dot}`} aria-hidden="true" />
          <span className="text-xs text-fg-subtle">{live.label}</span>
        </div>
      </div>

      {/* Métricas principales */}
      <PortfolioSummaryCards
        totalValue={totalValue}
        totalCost={totalCost}
        pnl={totalPnl}
        pnlPct={totalPnlPct}
        hasPrices={hasPrices}
        loading={lotsLoading}
        change24h={change24h}
        currency={currency}
        assetCount={assetCount}
        todayPnl={liveToday?.pnl ?? null}
        eurFlow={eurFlow}
        valueTooltip={
          <>
            <p>Valoración total de la cartera a precio de mercado en tiempo real: cripto + saldos en efectivo.</p>
            <div className="bg-overlay/5 rounded-lg px-3 py-2.5 space-y-1.5 text-xs">
              <div className="flex justify-between text-fg-muted">
                <span>Cripto</span>
                <span className="mono text-fg">{formatMoney(cryptoValue, currency)}</span>
              </div>
              <div className="flex justify-between text-fg-muted">
                <span>Cash / Fiat</span>
                <span className="mono text-fg">{formatMoney(totalFiat, currency)}</span>
              </div>
            </div>
          </>
        }
        costTooltip={
          <>
            <p>Importe total pagado para adquirir los activos que <span className="text-fg">aún mantienes en cartera</span>, según el método FIFO.</p>
            <p>Cada venta reduce este valor en proporción al lote consumido.</p>
          </>
        }
        pnlTooltip={
          <>
            <p>Diferencia entre la valoración actual y el coste FIFO de las posiciones abiertas.</p>
            <p className="mono text-xs bg-overlay/5 px-2.5 py-1.5 rounded-lg text-fg-muted">
              Valor actual − Coste de adquisición
            </p>
            <p className="text-fg-subtle">No tiene impacto fiscal hasta que se materialice con una venta.</p>
          </>
        }
        pnlPctTooltip={
          <>
            <p>Rendimiento porcentual sobre el capital invertido en las posiciones actuales.</p>
            <p className="mono text-xs bg-overlay/5 px-2.5 py-1.5 rounded-lg text-fg-muted">
              (Valor − Coste) ÷ Coste × 100
            </p>
          </>
        }
        eurFlowTooltip={eurFlow && (
          <>
            <p>Capital real comprometido en cripto: euros ingresados al exchange desde tu banco, menos lo retirado.</p>
            {flowCurrency === 'USD' && <p className="text-fg-subtle">En dólares, cada movimiento se convierte con el tipo de su fecha.</p>}
            <div className="bg-overlay/5 rounded-lg px-3 py-2.5 space-y-1.5 text-xs">
              <div className="flex justify-between text-fg-muted">
                <span>Depósitos al exchange</span>
                <span className="mono text-fg">{formatMoney(eurFlow.deposited, flowCurrency)}</span>
              </div>
              <div className="flex justify-between text-fg-muted">
                <span>Retiradas al banco</span>
                <span className="mono text-fg">− {formatMoney(eurFlow.withdrawn, flowCurrency)}</span>
              </div>
            </div>
          </>
        )}
      />

      {/* Top movers */}
      <TopMovers lots={lots} />

      {/* Gráfico histórico */}
      <EvolutionCard currentValue={hasPrices ? cryptoValue : undefined} />

      {/* Calendario de P&L diario */}
      <PnlCalendar />

      {/* Distribución + Fiscal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <AllocationChart lots={lots} fiatBalances={fiatBalances} />
        </div>
        <FiscalCard data={fiscal} />
      </div>

      {/* Actividad reciente */}
      <RecentActivity />

    </div>
  )
}
