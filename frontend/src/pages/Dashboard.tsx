import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
import { usePricesStore } from '../store/pricesStore'
import { formatEur } from '../utils/format'
import { type Change24h } from '../components/MetricCard'
import { PortfolioSummaryCards } from '../components/PortfolioSummaryCards'
import { TopMovers } from './dashboard/TopMovers'
import { RecentActivity } from './dashboard/RecentActivity'
import { PortfolioHistoryChart } from './dashboard/PortfolioHistoryChart'
import { AllocationChart } from './dashboard/AllocationChart'
import { FiscalCard } from './dashboard/FiscalCard'

export function Dashboard() {
  const prices = usePricesStore((s) => s.prices)
  const connected = usePricesStore((s) => s.connected)
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

  const { data: eurFlow } = useQuery({
    queryKey: ['eur-flow'],
    queryFn: portfolioApi.getEurFlow,
  })

  const { data: ydayData, isLoading: ydayLoading } = useQuery({
    queryKey: ['yesterday-prices'],
    queryFn: portfolioApi.getYesterdayPrices,
    staleTime: 10 * 60_000,
  })

  const totalFiat = fiatBalances.reduce((sum, bal) => sum + parseFloat(bal.balance), 0)

  const cryptoValue = lots.reduce((sum, lot) => {
    const price = prices[lot.asset] ?? 0
    return sum + parseFloat(lot.quantity) * price
  }, 0)
  const totalValue = cryptoValue + totalFiat
  const hasPrices = Object.keys(prices).length > 0

  const totalCost = lots.reduce((sum, lot) => sum + parseFloat(lot.cost_basis_eur), 0)
  const totalPnl = cryptoValue - totalCost
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0

  const change24h = useMemo((): Change24h | null => {
    if (!ydayData?.prices || !lots.length || !hasPrices) return null
    const yday = ydayData.prices
    let todayCovered = 0, ydayCovered = 0
    for (const lot of lots) {
      const qty      = parseFloat(lot.quantity)
      const today    = prices[lot.asset]
      const yesterday = yday[lot.asset]
      if (!today || !yesterday) continue
      todayCovered += qty * today
      ydayCovered  += qty * yesterday
    }
    if (cryptoValue > 0 && todayCovered / cryptoValue < 0.8) return null
    const total24hToday = todayCovered + totalFiat
    const total24hYday  = ydayCovered  + totalFiat
    const delta    = total24hToday - total24hYday
    const deltaPct = total24hYday > 0 ? (delta / total24hYday) * 100 : 0
    return {
      eur:      (delta >= 0 ? '+' : '') + formatEur(delta),
      pct:      (deltaPct >= 0 ? '+' : '') + deltaPct.toFixed(2) + '%',
      positive: delta >= 0,
    }
  }, [ydayData, lots, prices, cryptoValue, totalFiat, hasPrices])

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">
            {lastUpdate ? `Actualizado ${lastUpdate.toLocaleTimeString('es-ES')}` : 'Cargando precios...'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-accent-green animate-pulse' : 'bg-gray-500'}`} />
          <span className="text-xs text-gray-500">{connected ? 'Live' : 'Offline'}</span>
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
        change24hLoading={ydayLoading}
        eurFlow={eurFlow}
        valueTooltip={
          <>
            <p>Valoración total de la cartera a precio de mercado en tiempo real: cripto + saldos en efectivo.</p>
            <div className="bg-white/5 rounded-lg px-3 py-2.5 space-y-1.5 text-[10px]">
              <div className="flex justify-between text-gray-400">
                <span>Cripto</span>
                <span className="mono text-gray-200">{formatEur(cryptoValue)}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Cash / Fiat</span>
                <span className="mono text-gray-200">{formatEur(totalFiat)}</span>
              </div>
            </div>
          </>
        }
        costTooltip={
          <>
            <p>Importe total pagado para adquirir los activos que <span className="text-white">aún mantienes en cartera</span>, según el método FIFO.</p>
            <p>Cada venta reduce este valor en proporción al lote consumido.</p>
          </>
        }
        pnlTooltip={
          <>
            <p>Diferencia entre la valoración actual y el coste FIFO de las posiciones abiertas.</p>
            <p className="font-mono text-[10px] bg-white/5 px-2.5 py-1.5 rounded-lg text-gray-400">
              Valor actual − Coste de adquisición
            </p>
            <p className="text-gray-500">No tiene impacto fiscal hasta que se materialice con una venta.</p>
          </>
        }
        pnlPctTooltip={
          <>
            <p>Rendimiento porcentual sobre el capital invertido en las posiciones actuales.</p>
            <p className="font-mono text-[10px] bg-white/5 px-2.5 py-1.5 rounded-lg text-gray-400">
              (Valor − Coste) ÷ Coste × 100
            </p>
          </>
        }
        eurFlowTooltip={eurFlow && (
          <>
            <p>Capital real comprometido en cripto: euros ingresados al exchange desde tu banco, menos lo retirado.</p>
            <div className="bg-white/5 rounded-lg px-3 py-2.5 space-y-1.5 text-[10px]">
              <div className="flex justify-between text-gray-400">
                <span>Depósitos al exchange</span>
                <span className="mono text-gray-200">{formatEur(eurFlow.deposited)}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Retiradas al banco</span>
                <span className="mono text-gray-200">− {formatEur(eurFlow.withdrawn)}</span>
              </div>
            </div>
          </>
        )}
      />

      {/* Top movers */}
      <TopMovers lots={lots} />

      {/* Gráfico histórico */}
      <PortfolioHistoryChart currentValue={hasPrices ? cryptoValue : undefined} />

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
