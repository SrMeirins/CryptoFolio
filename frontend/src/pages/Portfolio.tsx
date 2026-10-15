import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
import { SaleSimulatorModal } from '../components/SaleSimulatorModal'
import { usePricesStore } from '../store/pricesStore'
import { RefreshCw, Wallet, Search, X } from 'lucide-react'
import { usePortfolioValuation } from '../hooks/usePortfolioValuation'
import { AllocationDonut } from './portfolio/AllocationDonut'
import { WalletSections } from './portfolio/WalletSections'
import { iconButtonClasses, fieldClasses, Button, EmptyState, LoadingState } from '../components/ui'

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

  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const [simulator, setSimulator] = useState<{ asset: string; qty: number; price: number } | null>(null)

  // Filtrar lots y fiatBalances por búsqueda
  const q = search.trim().toUpperCase()
  const filteredLots  = q ? lots.filter(l => l.asset.includes(q)) : lots
  const filteredFiats = q ? fiatBalances.filter(b => b.asset.includes(q)) : fiatBalances

  // Recuento de activos y de activos sin precio para la cabecera (sobre todo el portfolio)
  const { assetCount: assetsTotal, unpricedAssets } = usePortfolioValuation(lots, fiatBalances)
  const pricesMissing = unpricedAssets.length

  const hasPrices = Object.keys(prices).length > 0

  return (
    <>
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Cabecera */}
      <div className="flex items-center justify-between gap-4">
        <div className="shrink-0">
          <h1 className="text-2xl font-semibold">Portfolio</h1>
          {!isLoading && assetsTotal > 0 && (
            <p className="text-xs text-fg-subtle mt-0.5">
              {assetsTotal} activo{assetsTotal !== 1 ? 's' : ''}
              {pricesMissing > 0 && (
                <span className="text-warning ml-2">· {pricesMissing} sin precio</span>
              )}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-1 justify-end">
          {/* Buscador */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Buscar activo…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={fieldClasses('md', false, 'pl-8 pr-8 w-44 uppercase mono')}
            />
            {search && (
              <button
                type="button"
                aria-label="Borrar búsqueda"
                onClick={() => { setSearch(''); searchRef.current?.focus() }}
                className={iconButtonClasses('sm', false, 'absolute right-2.5 top-1/2 -translate-y-1/2')}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {!hasPrices && (
            <div className="flex items-center gap-1.5 text-xs text-fg-subtle shrink-0">
              <RefreshCw size={12} className="animate-spin" />
              Cargando precios...
            </div>
          )}
        </div>
      </div>

      {/* Gráfico de distribución — solo con precios disponibles */}
      {hasPrices && !isLoading && lots.length > 0 && (
        <AllocationDonut lots={lots} fiatBalances={fiatBalances} />
      )}

      {/* Secciones por wallet — agrupación dinámica */}
      {isLoading ? (
        <LoadingState label="Cargando lotes FIFO…" />
      ) : (
        <>
          {lots.length === 0 && fiatBalances.length === 0 ? (
            <EmptyState icon={<Wallet size={32} />} title="Sin activos en portfolio" description="Importa tu CSV de Binance para empezar" />
          ) : filteredLots.length === 0 && filteredFiats.length === 0 ? (
            <EmptyState
              compact
              icon={<Search size={22} />}
              title={<>Sin resultados para <span className="mono text-fg">"{search}"</span></>}
              action={<Button variant="ghost" size="sm" onClick={() => setSearch('')}>Limpiar búsqueda</Button>}
            />
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
