import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
import { usePricesStore } from '../store/pricesStore'
import { formatEur } from '../utils/format'
import { type Change24h } from '../components/MetricCard'
import { PortfolioSummaryCards } from '../components/PortfolioSummaryCards'
import { usePortfolioValuation } from '../hooks/usePortfolioValuation'
import { computeChange24h } from '../utils/change24h'
import { TopMovers } from './dashboard/TopMovers'
import { RecentActivity } from './dashboard/RecentActivity'
import { PortfolioHistoryChart } from './dashboard/PortfolioHistoryChart'
import { AllocationChart } from './dashboard/AllocationChart'
import { FiscalCard } from './dashboard/FiscalCard'

export function Dashboard() {
  const prices = usePricesStore((s) => s.prices)
  const open24 = usePricesStore((s) => s.open24)
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


  const {
    assets, cryptoValue, fiatValue: totalFiat, totalValue, totalCost,
    pnl: totalPnl, pnlPct: totalPnlPct,
  } = usePortfolioValuation(lots, fiatBalances)
  const hasPrices = Object.keys(prices).length > 0

  // Variación de 24h en tiempo real con el precio de hace 24h del WebSocket (#147).
  const change24h = useMemo((): Change24h => {
    const waiting = 'Esperando los precios en vivo. Aparecerá en cuanto llegue el primer dato.'
    if (!hasPrices) return { kind: 'unavailable', reason: waiting }
    const result = computeChange24h(assets, open24)
    if (result.status === 'unavailable') {
      return {
        kind: 'unavailable',
        reason: result.reason === 'no-prices' ? waiting : 'Aún no se ha recibido el precio de hace 24h de Binance.',
      }
    }
    return {
      kind: 'value',
      eur: (result.eur >= 0 ? '+' : '') + formatEur(result.eur),
      pct: (result.pct >= 0 ? '+' : '') + result.pct.toFixed(2) + '%',
      positive: result.eur >= 0,
      note: result.excluded.length > 0
        ? <p>Sin precio de hace 24h, excluidos del cálculo: <span className="mono text-white">{result.excluded.join(', ')}</span></p>
        : undefined,
    }
  }, [assets, open24, hasPrices])

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
