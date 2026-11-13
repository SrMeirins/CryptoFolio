import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { portfolioApi } from '../api/portfolio'
import { SaleSimulatorModal } from '../components/SaleSimulatorModal'
import { Search, X, Settings, Rows3, Rows4 } from 'lucide-react'
import { useDisplayLots, useDisplayMarket } from '../hooks/useDisplayMarket'
import { InventoryStrip } from './portfolio/InventoryStrip'
import { AssetDetailPanel } from './portfolio/AssetDetailPanel'
import { usePricesStore } from '../store/pricesStore'
import { WalletCards } from './portfolio/WalletCards'
import { WalletSections } from './portfolio/WalletSections'
import { DustSection } from './portfolio/DustSection'
import { iconButtonClasses, fieldClasses, Button, FilteredEmpty, MultiDropdown, Notice, NotApplicable, PageHeader, Skeleton, SkeletonGroup, SegmentedControl, Dropdown, panelClasses, panelEnterStyle, panelSurface, QueryError } from '../components/ui'
import { AssetTable } from '../components/AssetTable'
import { navIcon } from '../constants/navigation'
import { PieMetodologia } from '../components/metodologia'
import { FirstUseEmpty } from '../components/FirstUseEmpty'
import { useHasTransactions } from '../hooks/useHasTransactions'
import { portfolioSubtitle } from '../utils/panelSubtitles'
import { portfolioSections } from '../utils/portfolioSections'
import { portfolioInventory } from '../utils/portfolioInventory'
import { activosParam, assetView, filterByPnl, walletParam, type PnlFilter, type PortfolioView } from '../utils/portfolioView'
import { FiltroActivos } from './portfolio/FiltroActivos'
import { isSearchShortcut, readDensity, readDustOpen, readView, saveDensity, saveDustOpen, saveView, type Density } from '../utils/portfolioPrefs'
import { failure } from '../utils/queryFailure'

const VIEW_OPTIONS = [
  { value: 'asset' as const, label: 'Por activo', title: 'Una fila por activo con todas sus wallets' },
  { value: 'wallet' as const, label: 'Por wallet', title: 'Una tabla por wallet' },
]

const PNL_OPTIONS = [
  { value: 'all' as const, label: 'Todos' },
  { value: 'gain' as const, label: 'En ganancia' },
  { value: 'loss' as const, label: 'En pérdida' },
]

const DENSITY_OPTIONS = [
  { value: 'comfortable' as const, label: <Rows3 size={14} aria-hidden="true" />, title: 'Cómodo' },
  { value: 'compact' as const, label: <Rows4 size={14} aria-hidden="true" />, title: 'Compacto' },
]

export function Portfolio() {
  const firstUse = useHasTransactions()
  const lotsQ = useQuery({
    queryKey: ['fifo-lots'],
    queryFn: portfolioApi.getLots,
  })
  const { data: lots = [], isLoading } = lotsQ
  const fiatQ = useQuery({
    queryKey: ['fiat-balances'],
    queryFn: portfolioApi.getFiatBalances,
  })
  const { data: fiatBalances = [] } = fiatQ
  // Misma consulta (y caché) que la tabla de posiciones.
  const lockedQ = useQuery({
    queryKey: ['locked-amounts'],
    queryFn: portfolioApi.getLockedAmounts,
    staleTime: 60_000,
  })
  const { data: lockedAmounts = [] } = lockedQ
  const falloPosiciones = failure(lotsQ, fiatQ, lockedQ)

  // ?activo=XRP llega desde el mapa de calor del Dashboard (#233): abre el
  // panel de detalle de ese activo (#272).
  const [params] = useSearchParams()
  const navigate = useNavigate()
  // ?activos=AAA,BBB (#524): grupo de activos, p. ej. «Otros» del Dashboard.
  // Se lee de la URL, así que atrás y adelante del navegador lo respetan.
  const activos = useMemo(() => activosParam(params.get('activos')), [params])
  const setActivos = (lista: readonly string[]) => {
    const next = new URLSearchParams(params)
    if (lista.length > 0) next.set('activos', lista.join(',')); else next.delete('activos')
    // Comas sin codificar: la URL se lee, se guarda y se comparte mejor (los
    // símbolos solo llevan letras y cifras). navigate respeta la cadena tal cual.
    const busqueda = next.toString().replace(/%2C/gi, ',')
    navigate({ search: busqueda ? `?${busqueda}` : '' }, { replace: true })
  }
  const [search, setSearch] = useState('')
  const [detailAsset, setDetailAsset] = useState<string | null>(() => params.get('activo')?.toUpperCase() ?? null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [simulator, setSimulator] = useState<{ asset: string; qty: number; price: number } | null>(null)
  const [density, setDensity] = useState<Density>(readDensity)
  const [dustOpen, setDustOpen] = useState(readDustOpen)
  // Wallet elegida en las tarjetas (#270): filtra la tabla; null = todas.
  // ?wallet=<id> llega desde Ajustes (#448); solo se acepta un UUID.
  const [walletFilter, setWalletFilter] = useState<string | null>(() => walletParam(params.get('wallet')))
  // Vista de la tabla (recordada) y filtro de resultado (#271).
  const [view, setView] = useState<PortfolioView>(readView)
  const [pnlFilter, setPnlFilter] = useState<PnlFilter>('all')
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
  const filtered = useMemo(() => {
    if (!q && !walletFilter && activos.length === 0) return all
    const keep = (asset: string, walletId: string) => asset.includes(q) && (!walletFilter || walletId === walletFilter) && (activos.length === 0 || activos.includes(asset))
    return portfolioSections(
      displayLots.filter(l => keep(l.asset, l.wallet_id)), market.prices,
      fiatBalances.filter(b => keep(b.asset, b.wallet_id)), fiatPrice, market.dustThreshold,
    )
  }, [q, walletFilter, activos, all, displayLots, market.prices, fiatBalances, fiatPrice, market.dustThreshold])
  // Vista «Por activo» (#271): una fila por activo con todas sus wallets.
  const byAsset = useMemo(() => {
    const keep = (asset: string, walletId: string) => asset.includes(q) && (!walletFilter || walletId === walletFilter) && (activos.length === 0 || activos.includes(asset))
    return assetView(
      displayLots.filter(l => keep(l.asset, l.wallet_id)), market.prices,
      fiatBalances.filter(b => keep(b.asset, b.wallet_id)), fiatPrice, market.dustThreshold,
    )
  }, [q, walletFilter, activos, displayLots, market.prices, fiatBalances, fiatPrice, market.dustThreshold])
  const assetRows = useMemo(() => filterByPnl(byAsset.rows, pnlFilter, market.prices), [byAsset.rows, pnlFilter, market.prices])
  const walletSections = useMemo(
    () => filtered.sections
      .map(s => ({ ...s, rows: filterByPnl(s.rows, pnlFilter, market.prices) }))
      .filter(s => s.rows.length > 0),
    [filtered.sections, pnlFilter, market.prices],
  )
  // Fila consolidada del activo del panel de detalle, sobre toda la cartera (#272).
  const detailRow = useMemo(() => {
    if (!detailAsset) return null
    const v = assetView(displayLots, market.prices, [], fiatPrice, market.dustThreshold)
    const row = [...v.rows, ...v.dust].find(r => r.asset === detailAsset)
    return row && row.kind === 'crypto' ? row : null
  }, [detailAsset, displayLots, market.prices, fiatPrice, market.dustThreshold])
  // Inventario de toda la cartera: custodia, posiciones, bloqueado y wallets (#270).
  const inventory = useMemo(
    () => portfolioInventory(displayLots, market.prices, fiatBalances, fiatPrice, lockedAmounts, market.dustThreshold),
    [displayLots, market.prices, fiatBalances, fiatPrice, lockedAmounts, market.dustThreshold],
  )

  // Activos de la cartera para el selector «Activos» (#524); los que llegan por
  // la URL y ya no están también se listan, para poder quitarlos.
  const opcionesActivos = useMemo(() => {
    const todos = new Set([...displayLots.map(l => l.asset), ...activos])
    return [...todos].sort().map(a => ({ value: a, label: a }))
  }, [displayLots, activos])

  const hasPrices = Object.keys(market.prices).length > 0
  const walletCount = new Set(lots.map(l => l.wallet_id)).size
  const assetsTotal = new Set(lots.map(l => l.asset)).size
  // El polvo no se filtra por resultado: sus importes son irrelevantes.
  const dust = view === 'asset'
    ? { rows: pnlFilter === 'all' ? byAsset.dust : [], value: byAsset.dustValue }
    : { rows: pnlFilter === 'all' ? filtered.dust : [], value: filtered.dustValue }
  const mainCount = view === 'asset' ? assetRows.length : walletSections.length
  const nothingFound = mainCount === 0 && dust.rows.length === 0
  const filtersActive = !!search || !!walletFilter || pnlFilter !== 'all' || activos.length > 0
  const walletOptions = [{ value: '', label: 'Todas las wallets' }, ...inventory.wallets.map(w => ({ value: w.walletId, label: w.name }))]
  // Resumen de los filtros activos para el vacío por filtros (#496).
  const filtersSummary = [
    activos.length > 0 && `activos ${activos.join(', ')}`,
    search && `búsqueda «${search}»`,
    walletFilter && `wallet ${walletOptions.find(o => o.value === walletFilter)?.label ?? walletFilter}`,
    pnlFilter !== 'all' && PNL_OPTIONS.find(o => o.value === pnlFilter)?.label.toLowerCase(),
  ].filter(Boolean).join(', ')
  const clearFilters = () => { setSearch(''); setWalletFilter(null); setPnlFilter('all'); if (activos.length > 0) setActivos([]) }

  function changeView(next: PortfolioView) {
    setView(next)
    saveView(next)
  }

  function changeDensity(next: Density) {
    setDensity(next)
    saveDensity(next)
  }

  function toggleDust() {
    const next = !dustOpen
    setDustOpen(next)
    saveDustOpen(next)
  }

  // Sin ninguna operación (#496): un único vacío de primer uso.
  if (firstUse.empty) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <PageHeader icon={navIcon('/portfolio')} title="Portfolio" />
        <FirstUseEmpty what="tus posiciones y su P&L" />
      </div>
    )
  }

  return (
    <>
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      <PageHeader
        icon={navIcon('/portfolio')}
        title="Portfolio"
        subtitle={isLoading ? <Skeleton className="inline-block h-3.5 w-40 align-middle" /> : (
          <>
            {portfolioSubtitle(assetsTotal, walletCount)}
            {all.unpriced.length > 0 && <span className="text-warning ml-2">· {all.unpriced.length} sin precio</span>}
          </>
        )}
        actions={
          <>
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
            <MultiDropdown label="Filtrar por activos" placeholder="Todos los activos" plural="activos" searchable
              values={activos} options={opcionesActivos} onChange={v => setActivos(opcionesActivos.map(o => o.value).filter(a => v.includes(a)))} />
            <SegmentedControl label="Densidad de la tabla" variant="accent" value={density} onChange={changeDensity} options={DENSITY_OPTIONS} />
          </>
        }
      />

      <FiltroActivos activos={activos} onQuitar={a => setActivos(activos.filter(x => x !== a))} onLimpiar={() => setActivos([])} />

      {/* Activos sin precio: un único aviso para toda la cartera */}
      {all.unpriced.length > 0 && (
        <Notice tipo="aviso" role="status" compact action={
          <Link to="/settings?tab=assets" className="flex items-center gap-1 text-warning-ink hover:underline font-medium rounded focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
            <Settings size={11} aria-hidden="true" />
            Configurar en Ajustes
          </Link>
        }>
          <span className="mono font-semibold text-fg">{all.unpriced.join(', ')}</span>{' '}
          {all.unpriced.length === 1 ? 'no tiene precio configurado' : 'no tienen precio configurado'}: valor y P&L no disponibles.
        </Notice>
      )}

      {/* Inventario y wallets (#270): sustituyen al anillo de distribución, que
          duplicaba el panel del Dashboard. */}
      {/* Sin precios aún (#494): esqueleto con la forma de las cifras, no un texto suelto. */}
      {!hasPrices && !isLoading && lots.length > 0 && (
        <SkeletonGroup label="Cargando los precios" className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl overflow-hidden border border-border bg-border">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-background-card px-3.5 py-2.5 space-y-2"><Skeleton className="h-2.5 w-16" /><Skeleton className="h-4 w-24" /></div>
          ))}
        </SkeletonGroup>
      )}
      {hasPrices && !isLoading && inventory.wallets.length > 0 && (
        <>
          <InventoryStrip inventory={inventory} />
          <WalletCards wallets={inventory.wallets} selected={walletFilter} onSelect={setWalletFilter} />
        </>
      )}

      {/* Vista y filtros de la tabla (#271) */}
      {!isLoading && (lots.length > 0 || fiatBalances.length > 0) && (
        <div className="flex items-center gap-2 flex-wrap" role="toolbar" aria-label="Vista y filtros de la tabla">
          <SegmentedControl label="Vista de la tabla" variant="accent" value={view} onChange={changeView} options={VIEW_OPTIONS} />
          <SegmentedControl label="Filtrar por resultado" variant="accent" value={pnlFilter} onChange={setPnlFilter} options={PNL_OPTIONS} />
          {view === 'asset' && (
            <Dropdown size="sm" label="Filtrar por wallet" value={walletFilter ?? ''} onChange={v => setWalletFilter(v || null)} options={walletOptions} />
          )}
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>Quitar filtros</Button>
          )}
        </div>
      )}

      {/* Fallo de las posiciones (#498): antes que el vacío, que diría que no hay ninguna. */}
      {falloPosiciones ? (
        <QueryError what="las posiciones" error={falloPosiciones.error} onRetry={falloPosiciones.retry} className="rounded-xl border border-border" />
      ) : isLoading ? (
        <SkeletonGroup label="Cargando las posiciones" className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </SkeletonGroup>
      ) : lots.length === 0 && fiatBalances.length === 0 ? (
        // Hay operaciones, pero ninguna posición abierta: no aplica (#496).
        <NotApplicable className="border border-dashed border-border rounded-xl">No tienes posiciones abiertas: todo lo que compraste se ha vendido o retirado.</NotApplicable>
      ) : nothingFound ? (
        <FilteredEmpty summary={filtersSummary && `Filtros: ${filtersSummary}.`} onClear={clearFilters} />
      ) : (
        <>
          {view === 'asset' ? (
            <section aria-label="Posiciones" className={panelClasses(panelSurface('none', 'overflow-clip'))} style={panelEnterStyle(1)}>
              <AssetTable rows={assetRows} portfolioTotal={all.total} compact={compact}
                onSimulate={(asset, qty, price) => setSimulator({ asset, qty, price })} onOpen={setDetailAsset} exportName="posiciones"
                header={<>
                  <h2 className="text-sm font-semibold text-fg">Posiciones</h2>
                  <span className="text-xs text-fg-subtle">{assetRows.length} {assetRows.length === 1 ? 'activo' : 'activos'}</span>
                </>} />
            </section>
          ) : (
            <WalletSections sections={walletSections} total={all.total} compact={compact}
              onSimulate={(asset, qty, price) => setSimulator({ asset, qty, price })} onOpen={setDetailAsset} />
          )}
          <DustSection rows={dust.rows} value={dust.value} total={all.total} threshold={market.dustThreshold}
            compact={compact} open={dustOpen || (mainCount === 0 && dust.rows.length > 0)} onToggle={toggleDust}
            index={mainCount + 1} onOpen={setDetailAsset} />
        </>
      )}

      <PieMetodologia tema="valoracion">
        Valor con precios en vivo; coste y P&L según el FIFO global por activo.
      </PieMetodologia>
    </div>

    {detailRow && (() => {
      const price = market.prices[detailRow.asset] ?? 0
      const open = market.open24[detailRow.asset]
      return (
        <AssetDetailPanel
          row={detailRow}
          price={price}
          change24h={price > 0 && open > 0 ? ((price - open) / open) * 100 : null}
          currency={market.currency}
          rate={market.rate}
          locked={lockedAmounts.filter(l => l.asset === detailRow.asset)}
          onClose={() => setDetailAsset(null)}
          onSimulate={() => {
            // El simulador es fiscal y trabaja en EUR; se cierra el panel para
            // no apilar dos diálogos con el foco atrapado.
            setDetailAsset(null)
            setSimulator({ asset: detailRow.asset, qty: detailRow.totalQuantity, price: usePricesStore.getState().prices[detailRow.asset] ?? 0 })
          }}
        />
      )
    })()}

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
