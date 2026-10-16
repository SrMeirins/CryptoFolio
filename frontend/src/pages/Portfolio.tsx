import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { portfolioApi } from '../api/portfolio'
import { SaleSimulatorModal } from '../components/SaleSimulatorModal'
import { RefreshCw, Wallet, Search, X, Settings, Rows3, Rows4 } from 'lucide-react'
import { useDisplayLots, useDisplayMarket } from '../hooks/useDisplayMarket'
import { AllocationDonut } from './portfolio/AllocationDonut'
import { WalletSections } from './portfolio/WalletSections'
import { DustSection } from './portfolio/DustSection'
import { iconButtonClasses, fieldClasses, Button, EmptyState, LoadingState, PageHeader, SegmentedControl, panelEnterStyle } from '../components/ui'
import { navIcon } from '../constants/navigation'
import { portfolioSubtitle } from '../utils/panelSubtitles'
import { portfolioSections } from '../utils/portfolioSections'
import { isSearchShortcut, readDensity, readDustOpen, saveDensity, saveDustOpen, type Density } from '../utils/portfolioPrefs'

const DENSITY_OPTIONS = [
  { value: 'comfortable' as const, label: <Rows3 size={14} aria-hidden="true" />, title: 'Cómodo' },
  { value: 'compact' as const, label: <Rows4 size={14} aria-hidden="true" />, title: 'Compacto' },
]

export function Portfolio() {
  const { data: lots = [], isLoading } = useQuery({
    queryKey: ['fifo-lots'],
    queryFn: portfolioApi.getLots,
  })
  const { data: fiatBalances = [] } = useQuery({
    queryKey: ['fiat-balances'],
    queryFn: portfolioApi.getFiatBalances,
  })

  // ?activo=XRP llega desde el mapa de calor del Dashboard (#233).
  const [params] = useSearchParams()
  const [search, setSearch] = useState(() => params.get('activo') ?? '')
  const searchRef = useRef<HTMLInputElement>(null)
  const [simulator, setSimulator] = useState<{ asset: string; qty: number; price: number } | null>(null)
  const [density, setDensity] = useState<Density>(readDensity)
  const [dustOpen, setDustOpen] = useState(readDustOpen)
  const compact = density === 'compact'

  // «/» enfoca el buscador desde cualquier punto de la página (#269).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!isSearchShortcut(e)) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Valoración en la moneda de visualización (#177). El total y los activos
  // sin precio se calculan sobre toda la cartera; las secciones, sobre lo
  // que deja la búsqueda.
  const market = useDisplayMarket()
  const displayLots = useDisplayLots(lots, market)
  const fiatPrice = market.rate ?? 0
  const q = search.trim().toUpperCase()
  const all = useMemo(
    () => portfolioSections(displayLots, market.prices, fiatBalances, fiatPrice, market.dustThreshold),
    [displayLots, market.prices, fiatBalances, fiatPrice, market.dustThreshold],
  )
  const filtered = useMemo(() => (q
    ? portfolioSections(displayLots.filter(l => l.asset.includes(q)), market.prices, fiatBalances.filter(b => b.asset.includes(q)), fiatPrice, market.dustThreshold)
    : all), [q, all, displayLots, market.prices, fiatBalances, fiatPrice, market.dustThreshold])

  const hasPrices = Object.keys(market.prices).length > 0
  const walletCount = new Set(lots.map(l => l.wallet_id)).size
  const assetsTotal = new Set(lots.map(l => l.asset)).size
  const nothingFound = filtered.sections.length === 0 && filtered.dust.length === 0

  function changeDensity(next: Density) {
    setDensity(next)
    saveDensity(next)
  }

  function toggleDust() {
    const next = !dustOpen
    setDustOpen(next)
    saveDustOpen(next)
  }

  return (
    <>
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      <PageHeader
        icon={navIcon('/portfolio')}
        title="Portfolio"
        subtitle={!isLoading && (
          <>
            {portfolioSubtitle(assetsTotal, walletCount)}
            {all.unpriced.length > 0 && <span className="text-warning ml-2">· {all.unpriced.length} sin precio</span>}
          </>
        )}
        actions={
          <>
            {!hasPrices && (
              <div className="flex items-center gap-1.5 text-xs text-fg-subtle shrink-0" role="status">
                <RefreshCw size={12} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                Cargando precios…
              </div>
            )}
            {/* Buscador: «/» lo enfoca y Esc lo limpia (#269) */}
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle pointer-events-none" aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                placeholder="Buscar activo…"
                aria-label="Buscar activo (atajo: /)"
                aria-keyshortcuts="/"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape' && search) { e.preventDefault(); setSearch('') } }}
                className={fieldClasses('md', false, 'pl-8 pr-14 w-56 uppercase placeholder:normal-case mono [&::-webkit-search-cancel-button]:hidden')}
              />
              {search ? (
                <button
                  type="button"
                  aria-label="Borrar búsqueda"
                  onClick={() => { setSearch(''); searchRef.current?.focus() }}
                  className={iconButtonClasses('sm', false, 'absolute right-2.5 top-1/2 -translate-y-1/2')}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              ) : (
                <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] mono px-1.5 py-0.5 rounded border border-border text-fg-subtle pointer-events-none" aria-hidden="true">/</kbd>
              )}
            </div>
            <SegmentedControl label="Densidad de la tabla" variant="accent" value={density} onChange={changeDensity} options={DENSITY_OPTIONS} />
          </>
        }
      />

      {/* Activos sin precio: un único aviso para toda la cartera */}
      {all.unpriced.length > 0 && (
        <div role="status" className="flex items-center justify-between gap-3 px-4 py-2.5 bg-warning/5 border border-warning/20 rounded-xl text-xs">
          <span className="text-warning/90">
            <span className="mono font-semibold">{all.unpriced.join(', ')}</span>{' '}
            {all.unpriced.length === 1 ? 'no tiene precio configurado' : 'no tienen precio configurado'}: valor y P&L no disponibles.
          </span>
          <Link to="/settings?tab=assets" className="flex items-center gap-1 text-warning hover:text-warning/80 font-medium transition-colors shrink-0">
            <Settings size={11} aria-hidden="true" />
            Configurar en Ajustes
          </Link>
        </div>
      )}

      {/* Gráfico de distribución — solo con precios disponibles */}
      {hasPrices && !isLoading && lots.length > 0 && (
        <div className="panel-in" style={panelEnterStyle(0)}>
          <AllocationDonut lots={lots} fiatBalances={fiatBalances} />
        </div>
      )}

      {isLoading ? (
        <LoadingState label="Cargando lotes FIFO…" />
      ) : lots.length === 0 && fiatBalances.length === 0 ? (
        <EmptyState icon={<Wallet size={32} />} title="Sin activos en portfolio" description="Importa tu CSV de Binance para empezar" />
      ) : nothingFound ? (
        <EmptyState
          compact
          icon={<Search size={22} />}
          title={<>Sin resultados para <span className="mono text-fg">"{search}"</span></>}
          action={<Button variant="ghost" size="sm" onClick={() => setSearch('')}>Limpiar búsqueda</Button>}
        />
      ) : (
        <>
          <WalletSections sections={filtered.sections} total={all.total} compact={compact}
            onSimulate={(asset, qty, price) => setSimulator({ asset, qty, price })} />
          <DustSection rows={filtered.dust} value={filtered.dustValue} total={all.total} threshold={market.dustThreshold}
            compact={compact} open={dustOpen || (filtered.sections.length === 0 && filtered.dust.length > 0)} onToggle={toggleDust}
            index={filtered.sections.length + 1} />
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
