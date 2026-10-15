import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
import { formatMoney, formatMoneyCompact, formatPercent } from '../utils/format'
import { type Change24h } from '../components/MetricCard'
import { PortfolioSummaryCards } from '../components/PortfolioSummaryCards'
import { usePortfolioValuation } from '../hooks/usePortfolioValuation'
import { useDisplayMarket } from '../hooks/useDisplayMarket'
import { useCurrencyQuery } from '../hooks/useCurrencyQuery'
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
import { PageHeader, panelClasses, panelEnterStyle } from '../components/ui'
import { navIcon } from '../constants/navigation'
import { dashboardSubtitle } from '../utils/panelSubtitles'
import { useNow } from '../hooks/useNow'
import { valueSparkline } from '../utils/sparkline'

export function Dashboard() {
  // Precios en la moneda de visualización (#177): en USD sin USDT aún, vacíos.
  const { currency, prices, open24, fiatOpen24 } = useDisplayMarket()

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
  const now = useNow(60_000)
  const today = madridToday()
  const month = monthRange(ymOf(today), today)
  const { data: monthPnl } = useCurrencyQuery(
    c => dailyPnlQuery(c, month?.from, month?.to),
    { refetchInterval: 60_000, enabled: month !== null },
  )
  const liveToday = useLiveDayPnl(monthPnl?.currency === currency ? monthPnl.today : null, currency)
  // Mini-gráfico de la tarjeta Valor (#251): misma consulta (y caché) que el
  // gráfico de evolución en su periodo por defecto, «Todo».
  const { data: allPnl } = useCurrencyQuery(c => dailyPnlQuery(c), { refetchInterval: 60_000 })
  const hasPrices = Object.keys(prices).length > 0
  const valueTrend = useMemo(
    () => (allPnl?.currency === currency ? valueSparkline(allPnl.days, hasPrices ? totalValue : null) : []),
    [allPnl, currency, hasPrices, totalValue],
  )

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
      {/* El estado de los precios vive solo en la barra superior (#200) */}
      <PageHeader icon={navIcon('/')} title="Dashboard" subtitle={dashboardSubtitle(assetCount, new Date(now))} />

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
        valueTrend={valueTrend}
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

      {/* Paneles con entrada escalonada y elevación al pasar el cursor (#232) */}
      <div className={panelClasses('rounded-xl')} style={panelEnterStyle(1)}>
        <TopMovers lots={lots} />
      </div>

      <div className={panelClasses('rounded-xl')} style={panelEnterStyle(2)}>
        <EvolutionCard />
      </div>

      <div className={panelClasses('rounded-xl')} style={panelEnterStyle(3)}>
        <PnlCalendar />
      </div>

      {/* Distribución + Fiscal */}
      {/* Distribución y Fiscal con la misma altura; el fiscal la llena con su gráfico mensual (#236) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={panelClasses('rounded-xl lg:col-span-2 h-full')} style={panelEnterStyle(4)}>
          <AllocationChart lots={lots} fiatBalances={fiatBalances} />
        </div>
        <div className={panelClasses('rounded-xl h-full')} style={panelEnterStyle(5)}>
          <FiscalCard data={fiscal} />
        </div>
      </div>

      <div className={panelClasses('rounded-xl')} style={panelEnterStyle(6)}>
        <RecentActivity />
      </div>

    </div>
  )
}
