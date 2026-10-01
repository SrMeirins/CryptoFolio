import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
import { SaleSimulatorModal } from '../components/SaleSimulatorModal'
import { usePricesStore } from '../store/pricesStore'
import { formatEur } from '../utils/format'
import { PortfolioSummaryCards } from '../components/PortfolioSummaryCards'
import { RefreshCw, Wallet, Search, X } from 'lucide-react'
import { usePortfolioTotals } from './portfolio/usePortfolioTotals'
import { AllocationDonut } from './portfolio/AllocationDonut'
import { WalletSections } from './portfolio/WalletSections'

export function Portfolio() {
  const prices = usePricesStore(s => s.prices)

  const { data: lots = [], isLoading } = useQuery({
    queryKey: ['fifo-lots'],
    queryFn: portfolioApi.getLots,
  })
  const { data: fiatBalances = [] } = useQuery({
    queryKey: ['fiat-balances'],
    queryFn: portfolioApi.getFiatBalances,
  })
  const { data: eurFlow } = useQuery({
    queryKey: ['eur-flow'],
    queryFn: portfolioApi.getEurFlow,
  })

  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const [simulator, setSimulator] = useState<{ asset: string; qty: number; price: number } | null>(null)

  // Filtrar lots y fiatBalances por búsqueda
  const q = search.trim().toUpperCase()
  const filteredLots  = q ? lots.filter(l => l.asset.includes(q)) : lots
  const filteredFiats = q ? fiatBalances.filter(b => b.asset.includes(q)) : fiatBalances

  const { totalValue, totalCost, pnl, pnlPct, assetsTotal, pricesMissing } =
    usePortfolioTotals(lots, fiatBalances)   // totales siempre sobre todo el portfolio

  const hasPrices = Object.keys(prices).length > 0

  return (
    <>
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Cabecera */}
      <div className="flex items-center justify-between gap-4">
        <div className="shrink-0">
          <h1 className="text-2xl font-semibold">Portfolio</h1>
          {!isLoading && assetsTotal > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">
              {assetsTotal} activo{assetsTotal !== 1 ? 's' : ''}
              {pricesMissing > 0 && (
                <span className="text-accent-amber ml-2">· {pricesMissing} sin precio</span>
              )}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-1 justify-end">
          {/* Buscador */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Buscar activo…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-background-card border border-border rounded-xl pl-8 pr-8 py-2 text-sm placeholder-gray-600 focus:outline-none focus:border-accent-blue/50 transition-colors w-44 uppercase mono"
            />
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); searchRef.current?.focus() }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {!hasPrices && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
              <RefreshCw size={12} className="animate-spin" />
              Cargando precios...
            </div>
          )}
        </div>
      </div>

      {/* Totales globales */}
      <PortfolioSummaryCards
        totalValue={totalValue}
        totalCost={totalCost}
        pnl={pnl}
        pnlPct={pnlPct}
        hasPrices={hasPrices}
        loading={isLoading}
        eurFlow={eurFlow}
        valueTooltip={
          <>
            <p>Valoración de mercado de la cartera en tiempo real, calculada multiplicando la cantidad de cada activo por su cotización actual en Binance.</p>
            {pricesMissing > 0
              ? <p className="text-accent-amber/90">⚠ {pricesMissing} activo{pricesMissing > 1 ? 's no tienen' : ' no tiene'} precio configurado y no {pricesMissing > 1 ? 'se incluyen' : 'se incluye'} en este total.</p>
              : <p className="text-gray-500">Los precios se actualizan automáticamente cada 60 s vía WebSocket.</p>
            }
          </>
        }
        costTooltip={
          <>
            <p>Importe total pagado para adquirir los activos que <span className="text-white">aún mantienes en cartera</span>, según el método FIFO (First In, First Out).</p>
            <p>Cada venta reduce este valor en proporción al lote consumido. No refleja lo invertido históricamente, sino únicamente el coste de las posiciones abiertas.</p>
          </>
        }
        pnlTooltip={
          <>
            <p>Diferencia entre la valoración actual de la cartera y su coste de adquisición FIFO. Refleja el resultado <span className="text-white">latente</span> de las posiciones abiertas.</p>
            <p className="font-mono text-[10px] bg-white/5 px-2.5 py-1.5 rounded-lg text-gray-400">
              Valor actual − Coste de adquisición
            </p>
            <p className="text-gray-500">Este beneficio o pérdida no es definitivo hasta que se materialice con una venta. No tiene impacto fiscal hasta entonces.</p>
          </>
        }
        pnlPctTooltip={
          <>
            <p>Rendimiento porcentual de la cartera sobre el capital invertido en las posiciones actuales.</p>
            <p className="font-mono text-[10px] bg-white/5 px-2.5 py-1.5 rounded-lg text-gray-400">
              (Valor actual − Coste) ÷ Coste × 100
            </p>
            <p className="text-gray-500">No incluye beneficios ya realizados en ventas anteriores.</p>
          </>
        }
        eurFlowTooltip={eurFlow && (
          <>
            <p>Capital neto comprometido en el mercado cripto: total ingresado al exchange desde tu cuenta bancaria, descontando lo que ya has recuperado.</p>
            <div className="bg-white/5 rounded-lg px-3 py-2.5 space-y-1.5 text-[10px]">
              <div className="flex justify-between text-gray-400">
                <span>Depósitos al exchange</span>
                <span className="mono text-gray-200">{formatEur(eurFlow.deposited)}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Retiradas al banco</span>
                <span className="mono text-gray-200">− {formatEur(eurFlow.withdrawn)}</span>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-1.5 font-semibold">
                <span className="text-white">Capital neto</span>
                <span className="mono text-white">{formatEur(eurFlow.netFromBank)}</span>
              </div>
            </div>
            <p className="text-gray-500">Del total neto, {formatEur(eurFlow.eurSpentBuying)} se han convertido en criptoactivos.</p>
          </>
        )}
      />

      {/* Gráfico de distribución — solo con precios disponibles */}
      {hasPrices && !isLoading && lots.length > 0 && (
        <AllocationDonut lots={lots} fiatBalances={fiatBalances} />
      )}

      {/* Secciones por wallet — agrupación dinámica */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-gray-500 text-sm gap-2">
          <RefreshCw size={14} className="animate-spin" />
          Cargando lotes FIFO...
        </div>
      ) : (
        <>
          {lots.length === 0 && fiatBalances.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Wallet size={32} className="text-gray-700" />
              <p className="text-gray-500 text-sm">Sin activos en portfolio</p>
              <p className="text-gray-600 text-xs">Importa tu CSV de Binance para empezar</p>
            </div>
          ) : filteredLots.length === 0 && filteredFiats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <Search size={22} className="text-gray-700" />
              <p className="text-gray-500 text-sm">Sin resultados para <span className="mono text-white">"{search}"</span></p>
              <button type="button" onClick={() => setSearch('')} className="text-xs text-accent-blue hover:text-accent-blue/80 transition-colors">
                Limpiar búsqueda
              </button>
            </div>
          ) : (
            <WalletSections lots={filteredLots} fiatBalances={filteredFiats} onSimulate={(asset, qty, price) => setSimulator({ asset, qty, price })} />
          )}
        </>
      )}
    </div>

    {simulator && (
      <SaleSimulatorModal
        asset={simulator.asset}
        totalQty={simulator.qty}
        currentPrice={simulator.price}
        onClose={() => setSimulator(null)}
      />
    )}
    </>
  )
}
