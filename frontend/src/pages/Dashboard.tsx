import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
import { formatMoney, formatMoneyCompact, formatPercent } from '../utils/format'
import { type Change24h } from '../components/Change24hChip'
import { PortfolioSummaryCards } from '../components/PortfolioSummaryCards'
import { usePortfolioValuation } from '../hooks/usePortfolioValuation'
import { useDisplayMarket } from '../hooks/useDisplayMarket'
import { FxEffectNote } from '../components/FxEffectNote'
import { useCurrencyQuery } from '../hooks/useCurrencyQuery'
import { dailyPnlQuery, eurFlowQuery } from '../queries/currencyQueries'
import { computeChange24h } from '../utils/change24h'
import { TopMovers } from './dashboard/TopMovers'
import { RecentActivity } from './dashboard/RecentActivity'
import { IngresosPasivos } from './dashboard/IngresosPasivos'
import { EvolutionCard } from './dashboard/EvolutionCard'
import { PnlCalendar } from './dashboard/PnlCalendar'
import { RendimientoCard } from './dashboard/RendimientoCard'
import { AllocationChart } from './dashboard/AllocationChart'
import { FiscalCard } from './dashboard/FiscalCard'
import { FranjaMetas } from './dashboard/metas/FranjaMetas'
import { ResumenSemana } from './dashboard/resumen/ResumenSemana'
import { BarraContraida, BotonContraer, PanelAbierto } from './dashboard/PanelDashboard'
import { ModoPersonalizar } from './dashboard/ModoPersonalizar'
import { useDashboardDiseno } from '../hooks/useDashboardDiseno'
import { alternar, filasDashboard, type PanelId } from '../utils/dashboardDiseno'
import { LayoutDashboard } from 'lucide-react'
import { Button, Skeleton, SkeletonGroup } from '../components/ui'
import { localToday } from '../utils/pnlChart'
import { monthRange, ymOf } from '../utils/pnlCalendar'
import { useLiveDayPnl } from '../hooks/useLiveDayPnl'
import { usePreparacionHistoricos } from '../hooks/usePreparacionHistoricos'
import { PageHeader, panelClasses, panelEnterStyle, QueryError } from '../components/ui'
import { failure } from '../utils/queryFailure'
import { navIcon } from '../constants/navigation'
import { FirstUseEmpty } from '../components/FirstUseEmpty'
import { useHasTransactions } from '../hooks/useHasTransactions'
import { dashboardSubtitle } from '../utils/panelSubtitles'
import { useNow } from '../hooks/useNow'
import { fieldSparkline, unrealizedSparkline, returnSparkline, valueSparkline } from '../utils/sparkline'

export function Dashboard() {
  const firstUse = useHasTransactions()
  // Precios en la moneda de visualización (#177): en USD sin USDT aún, vacíos.
  const { currency, prices, open24, fiatOpen24 } = useDisplayMarket()

  const lotsQ = useQuery({
    queryKey: ['fifo-lots'],
    queryFn: portfolioApi.getLots,
    refetchInterval: 60_000,
  })
  const { data: lots = [], isLoading: lotsLoading } = lotsQ

  const fiscalQ = useQuery({
    queryKey: ['fiscal-summary'],
    queryFn: portfolioApi.getFiscalSummary,
  })
  const { data: fiscal = [] } = fiscalQ

  const fiatQ = useQuery({
    queryKey: ['fiat-balances'],
    queryFn: portfolioApi.getFiatBalances,
    refetchInterval: 60_000,
  })
  const { data: fiatBalances = [] } = fiatQ

  const eurFlowQ = useCurrencyQuery(eurFlowQuery)
  const { data: eurFlow } = eurFlowQ
  const flowCurrency = eurFlow?.currency ?? currency


  const {
    assets, cryptoValue, fiatValue: totalFiat, totalValue, totalCost,
    pnl: totalPnl, pnlPct: totalPnlPct, assetCount,
  } = usePortfolioValuation(lots, fiatBalances)

  // «Hoy» de la tarjeta de P&L (#210): misma consulta (y caché) que el mes en
  // curso del calendario y mismo cálculo en vivo, así que ambas cifras coinciden.
  const now = useNow(60_000)
  const today = localToday()
  const month = monthRange(ymOf(today), today)
  const monthPnlQ = useCurrencyQuery(
    c => dailyPnlQuery(c, month?.from, month?.to),
    { refetchInterval: 60_000, enabled: month !== null },
  )
  const { data: monthPnl } = monthPnlQ
  const liveToday = useLiveDayPnl(monthPnl?.currency === currency ? monthPnl.today : null, currency)
  // Sin todos los cierres históricos, ni P&L de hoy ni mini-gráfico (#334).
  const preparacion = usePreparacionHistoricos()
  // Mini-gráfico de la tarjeta Valor (#251): misma consulta (y caché) que el
  // gráfico de evolución en su periodo por defecto, «Todo».
  const allPnlQ = useCurrencyQuery(c => dailyPnlQuery(c), { refetchInterval: 60_000 })
  const { data: allPnl } = allPnlQ
  // Fallos (#498): las posiciones alimentan casi todo el Dashboard; P&L y flujo
  // de euros, solo las cifras secundarias de las tarjetas.
  const falloPosiciones = failure(lotsQ, fiatQ)
  const falloCifras = failure(eurFlowQ, monthPnlQ, allPnlQ)
  const hasPrices = Object.keys(prices).length > 0
  const valueTrend = useMemo(
    () => (preparacion.listo && allPnl?.currency === currency ? valueSparkline(allPnl.days, hasPrices ? totalValue : null) : []),
    [preparacion.listo, allPnl, currency, hasPrices, totalValue],
  )
  // P&L, Rentabilidad, Coste y EUR neto (#412, #507): la misma serie diaria,
  // sin peticiones nuevas. Coste y EUR neto vienen de la API, no se aproximan.
  const trendDays = preparacion.listo && allPnl?.currency === currency ? allPnl.days : null
  const pnlTrend = useMemo(() => (trendDays ? unrealizedSparkline(trendDays, hasPrices ? totalPnl : null) : []), [trendDays, hasPrices, totalPnl])
  const returnTrend = useMemo(() => (trendDays ? returnSparkline(trendDays) : []), [trendDays])
  const costTrend = useMemo(() => (trendDays ? fieldSparkline(trendDays, 'cost', totalCost) : []), [trendDays, totalCost])
  // El EUR neto de la tarjeta viene en la moneda del flujo de euros: la punta solo si coincide.
  const eurNetTrend = useMemo(
    () => (trendDays ? fieldSparkline(trendDays, 'eurNet', eurFlow && eurFlow.currency === currency ? eurFlow.netFromBank : null) : []),
    [trendDays, eurFlow, currency],
  )

  // Destinos de las tarjetas (#412). Rentabilidad baja al gráfico de evolución
  // y le pasa el foco, para que el teclado y el lector sigan el salto.
  const navigate = useNavigate()
  const evolutionRef = useRef<HTMLDivElement>(null)
  // Dashboard personalizable (#521): orden, ocultos y contraídos, y el modo Personalizar.
  const { diseno, guardar: guardarDiseno, cargado: disenoCargado } = useDashboardDiseno()
  const [personalizando, setPersonalizando] = useState(false)
  // Las métricas fijas quedan inertes mientras se personaliza (sin foco ni clic).
  const kpiRef = useRef<HTMLDivElement>(null)
  useEffect(() => { kpiRef.current?.toggleAttribute('inert', personalizando) }, [personalizando])
  // Si Evolución está oculta o contraída, la tarjeta Rentabilidad la abre y
  // baja a ella cuando ya está montada.
  // Ir a un panel (Rentabilidad a Evolución, #412; el resumen de 7 días a P&L
  // diario, #522): si está oculto o minimizado se muestra, y se baja a él con
  // el foco cuando ya está montado.
  const irA = useRef<PanelId | null>(null)
  const bajarA = (id: PanelId) => {
    const el = id === 'evolucion' ? evolutionRef.current : document.querySelector<HTMLElement>(`main [data-panel="${id}"]`)
    if (!el) return false
    el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    const foco = id === 'evolucion' ? el : el.querySelector<HTMLElement>('section, [role="region"]') ?? el
    if (!foco.hasAttribute('tabindex') && !foco.matches('a, button')) foco.setAttribute('tabindex', '-1')
    foco.focus({ preventScroll: true })
    return true
  }
  useEffect(() => {
    if (irA.current && bajarA(irA.current)) irA.current = null
  }, [diseno])
  const irAPanel = (id: PanelId) => {
    if (personalizando || diseno.ocultos.includes(id) || diseno.contraidos.includes(id)) {
      setPersonalizando(false)
      irA.current = id
      void guardarDiseno({ ...diseno, ocultos: alternar(diseno.ocultos, id, false), contraidos: alternar(diseno.contraidos, id, false) })
      return
    }
    bajarA(id)
  }
  const targets = {
    portfolio: () => navigate('/portfolio'),
    evolution: () => irAPanel('evolucion'),
    withdrawn: () => navigate('/history?tarjeta=retirado'),
  }

  // Variación de 24h en tiempo real con el precio de hace 24h del WebSocket (#147).
  // Se memoriza el cálculo, no el texto: el formato depende de la moneda y del
  // modo privacidad (#254), y se aplica en cada render.
  const change24hResult = useMemo(
    () => (hasPrices ? computeChange24h(assets, open24, fiatOpen24) : null),
    [assets, open24, fiatOpen24, hasPrices],
  )
  const change24h = ((): Change24h => {
    const waiting = 'Esperando los precios en vivo. Aparecerá en cuanto llegue el primer dato.'
    const result = change24hResult
    if (!result) return { kind: 'unavailable', reason: waiting }
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
  })()

  const contraer = (id: PanelId, si: boolean) => void guardarDiseno({ ...diseno, contraidos: alternar(diseno.contraidos, id, si) })

  /** Contenido de cada panel; cada uno lleva su superficie (panelSurface) dentro. */
  const contenido: Record<PanelId, () => ReactNode> = {
    resumen: () => (
      <ResumenSemana valorAhora={hasPrices ? totalValue : null}
        onIrAPnl={() => { navigate({ search: '?pnl-diario=7d' }, { replace: true }); irAPanel('pnl-diario') }} />
    ),
    metas: () => null,
    variacion: () => <TopMovers lots={lots} pnlHoy={preparacion.listo ? liveToday?.pnl ?? null : null} />,
    evolucion: () => <EvolutionCard />,
    rendimiento: () => <RendimientoCard />,
    'pnl-diario': () => <PnlCalendar />,
    distribucion: () => <AllocationChart lots={lots} fiatBalances={fiatBalances} />,
    fiscal: () => <FiscalCard data={fiscal} dataQuery={fiscalQ} />,
    actividad: () => <RecentActivity />,
    ingresos: () => <IngresosPasivos />,
  }

  /** Un panel en su fila: contraído, la barra; abierto, con entrada escalonada y botón de contraer. */
  function panel(id: PanelId, fila: number, extra = ''): ReactNode {
    const estilo: CSSProperties = panelEnterStyle(fila + 1)
    if (diseno.contraidos.includes(id)) return <BarraContraida key={id} id={id} className={extra} onExpandir={() => contraer(id, false)} />
    if (id === 'metas') {
      return (
        <div key={id} data-panel={id}>
          <FranjaMetas valorTotal={hasPrices ? totalValue : null} assets={assets}
            accion={<BotonContraer id="metas" flotante={false} onContraer={() => contraer('metas', true)} />} />
        </div>
      )
    }
    if (id === 'evolucion') {
      return (
        <PanelAbierto key={id} id={id} className={extra} onContraer={() => contraer(id, true)}>
          <div ref={evolutionRef} id="evolucion" tabIndex={-1} role="region" aria-label="Evolución de la cartera"
            className={panelClasses('rounded-xl scroll-mt-4 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60')} style={estilo}>
            {contenido.evolucion()}
          </div>
        </PanelAbierto>
      )
    }
    return (
      <PanelAbierto key={id} id={id} className={extra} onContraer={() => contraer(id, true)}>
        <div className={panelClasses('rounded-xl min-w-0 h-full')} style={estilo}>{contenido[id]()}</div>
      </PanelAbierto>
    )
  }

  // Sin ninguna operación (#496): un único vacío de primer uso en lugar de los paneles en blanco.
  if (firstUse.empty) {
    return (
      <div className="p-6 space-y-6 max-w-[1920px] mx-auto">
        <PageHeader icon={navIcon('/')} title="Dashboard" />
        <FirstUseEmpty what="tu cartera, su evolución y el resumen fiscal" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-[1920px] mx-auto">
      {/* Header */}
      {/* El estado de los precios vive solo en la barra superior (#200) */}
      <PageHeader icon={navIcon('/')} title="Dashboard" subtitle={dashboardSubtitle(assetCount, new Date(now))}
        actions={!personalizando && (
          <Button size="sm" variant="ghost" icon={<LayoutDashboard size={14} aria-hidden="true" />} onClick={() => setPersonalizando(true)}>Personalizar</Button>
        )} />

      {falloPosiciones && <QueryError what="las posiciones" error={falloPosiciones.error} onRetry={falloPosiciones.retry}
        className="rounded-xl border border-border" />}
      {falloCifras && <QueryError what="el P&L y el flujo de euros" error={falloCifras.error} onRetry={falloCifras.retry}
        className="rounded-xl border border-border" />}

      {/* Métricas principales */}
      {/* En el modo Personalizar las métricas fijas se atenúan e inactivan (#521). */}
      <div ref={kpiRef} className={`transition-[opacity,filter] duration-300 ${personalizando ? 'opacity-50 saturate-50' : ''}`}>
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
        todayPct={preparacion.listo ? liveToday?.pct ?? null : null}
        todayPnl={preparacion.listo ? liveToday?.pnl ?? null : null}
        todayPending={!preparacion.listo}
        valueTrend={valueTrend}
        costTrend={costTrend}
        pnlTrend={pnlTrend}
        returnTrend={returnTrend}
        eurNetTrend={eurNetTrend}
        targets={targets}
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
            {currency === 'USD' && <FxEffectNote lots={lots} />}
          </>
        }
        pnlPctTooltip={
          <>
            <p>Rendimiento porcentual sobre el capital invertido en las posiciones actuales.</p>
            <p className="mono text-xs bg-overlay/5 px-2.5 py-1.5 rounded-lg text-fg-muted">
              (Valor − Coste) ÷ Coste × 100
            </p>
            {currency === 'USD' && <FxEffectNote lots={lots} />}
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
      </div>

      {/* Paneles personalizables (#521): en el modo Personalizar, la lista del
          diseño en su lugar; si no, las filas en su orden, sin los ocultos y con
          los contraídos como barra (no se montan: no piden datos). */}
      {!disenoCargado ? (
        // Hasta que llega el diseño, un esqueleto: pintar el orden por defecto haría saltar los paneles.
        <SkeletonGroup label="Cargando los paneles del Dashboard" className="space-y-4">
          <Skeleton className="h-48 w-full" /><Skeleton className="h-72 w-full" />
        </SkeletonGroup>
      ) : personalizando ? (
        <ModoPersonalizar diseno={diseno} onCambiar={d => guardarDiseno(d)}
          onRestaurar={d => void guardarDiseno(d, { mensaje: 'Diseño por defecto del Dashboard', deshacer: true })}
          onListo={() => setPersonalizando(false)} />
      ) : filasDashboard(diseno).map((fila, i) => fila.tipo === 'pareja' ? (
        // Distribución y Fiscal juntos: misma altura, el primero en 2/3 (#236).
        <div key={fila.ids.join()} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {fila.ids.map(id => panel(id, i, id === 'distribucion' ? 'lg:col-span-2 h-full' : 'h-full'))}
        </div>
      ) : panel(fila.id, i))}
    </div>
  )
}
