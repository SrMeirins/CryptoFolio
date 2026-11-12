import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { portfolioApi } from '../api/portfolio'
import { FISCAL_STALE_TIME } from './fiscal/constants'
import { fiscalYearQueries, prefetchOrder } from './fiscal/fiscalYearQueries'
import { baseTramosCompensada } from '../utils/tramosIrpf'
import { adjacentYear, cuotaAhorro, FISCAL_VISTAS, localMonthDay, parseVista, yearComparison, type FiscalVista } from '../utils/fiscalHeader'
import { useTramos } from '../hooks/useTramos'
import { ComparativaAnual } from './fiscal/charts/ComparativaAnual'
import { EvolucionMensual } from './fiscal/charts/EvolucionMensual'
import { DesglosePorActivo } from './fiscal/charts/DesglosePorActivo'
import { filtersFromUrl, monthRange } from '../utils/fiscalCharts'
import { AvisoCaducidad, PerdidasPendientes } from './fiscal/PerdidasPendientes'
import { caducanEsteAnio } from '../utils/perdidasPendientes'
import { Modelo721Card } from './fiscal/Modelo721Card'
import { TablaEventos } from './fiscal/TablaEventos'
import { SeccionRendimientos } from './fiscal/rendimientos/SeccionRendimientos'
import { ExportPanel } from './fiscal/ExportPanel'
import { YearTabs } from './fiscal/YearTabs'
import { YearCards } from './fiscal/YearCards'
import { historyYearLink } from './history/keyboard/yearNav'
import { FiscalHero, FiscalHeroSkeleton } from './fiscal/FiscalHero'
import { PlanificadorTab } from './fiscal/PlanificadorTab'
import { CalendarioFiscal } from './fiscal/CalendarioFiscal'
import { EstadoDeclaracion } from './fiscal/declaracion/EstadoDeclaracion'
import type { FiscalHito } from '../api/portfolio'
import { useFiscalShortcuts } from './fiscal/useFiscalShortcuts'
import { EurOnlyBadge } from '../components/EurOnlyBadge'
import { badgeClasses, cardClasses, EmptyState, QueryError, Skeleton, PageHeader, panelEnterStyle, tabId, tabPanelId, SectionNav, RefreshBar, ViewHeader, type StatStripCell } from '../components/ui'
import { navIcon } from '../constants/navigation'
import { FirstUseEmpty } from '../components/FirstUseEmpty'
import { useHasTransactions } from '../hooks/useHasTransactions'
import { PieMetodologia, type TemaMetodo } from '../components/metodologia'
import { failure } from '../utils/queryFailure'
import { AlertTriangle, Landmark, LayoutDashboard, ListOrdered, PiggyBank, type LucideIcon } from 'lucide-react'
import { avisosVistas, ESTADO_EJERCICIO_LABEL, estadoEjercicio } from '../utils/fiscalNav'
import { MODELO721_LABELS, modelo721Status } from '../utils/modelo721Status'
import { formatEur, formatNumber } from '../utils/format'
import { liveModelo721, margenUmbral } from '../utils/modelo721View'
import { usePricesStore } from '../store/pricesStore'
import { necesitaRevision } from '../utils/fiscalOperations'
import { sinEfecto } from '../utils/operacionesTabla'

const VISTA_LABELS: Record<FiscalVista, string> = { resumen: 'Resumen', operaciones: 'Operaciones', modelo721: 'Modelo 721', planificar: 'Planificar' }
/** Icono de cada vista en el menú lateral (#535). */
const VISTA_ICON: Record<FiscalVista, LucideIcon> = { resumen: LayoutDashboard, operaciones: ListOrdered, modelo721: Landmark, planificar: PiggyBank }
const ID_BASE = 'fiscal-vista'

/** Tema de «Cómo calculamos» que abre el pie en cada vista (#493). */
const TEMA_VISTA: Record<FiscalVista, TemaMetodo> = { resumen: 'fifo', operaciones: 'fifo', planificar: 'compensacion', modelo721: 'modelo721' }

/** Bloque con la entrada escalonada de paneles (#297). */
function Block({ i, children, className = '' }: { i: number; children: ReactNode; className?: string }) {
  return <div className={`panel-in ${className}`} style={panelEnterStyle(i)}>{children}</div>
}

/** Título y contexto de cada vista (#491). */
function vistaHeader(vista: FiscalVista, year: number): { title: string; subtitle: string } {
  switch (vista) {
    case 'resumen': return { title: `Resumen del ejercicio ${year}`, subtitle: 'Neto a declarar, plazos, comparativas y pérdidas pendientes.' }
    case 'operaciones': return { title: `Operaciones de ${year}`, subtitle: 'Ganancia o pérdida de cada transmisión y rendimientos del ejercicio.' }
    case 'modelo721': return { title: `Modelo 721 de ${year}`, subtitle: 'Saldos en custodia de terceros a 31 de diciembre.' }
    case 'planificar': return { title: 'Planificar el ejercicio en curso', subtitle: 'Pérdidas que puedes realizar y ganancias que caben sin tributar.' }
  }
}

export function Fiscal() {
  const firstUse = useHasTransactions()
  const livePrices = usePricesStore(st => st.prices)
  const [searchParams, setSearchParams] = useSearchParams()
  // ?anio=2025 llega desde el resultado de una importación (#324).
  const [selectedYear, setSelectedYear] = useState<number | null>(() => {
    const a = parseInt(searchParams.get('anio') ?? '', 10)
    return a >= 2009 && a <= 2100 ? a : null
  })
  const vista = parseVista(searchParams.get('vista'))
  // Colchón de Planificar para su cabecera (#535): misma consulta y caché que la vista; su fallo lo trata la vista.
  const { data: planner } = useQuery({ queryKey: ['fiscal-planner'], queryFn: portfolioApi.getFiscalPlanner, staleTime: 60_000, enabled: vista === 'planificar' })
  const queryClient = useQueryClient()

  const yearsQ = useQuery({ queryKey: ['fiscal-years'], queryFn: portfolioApi.getFiscalYears })
  const { data: years = [] } = yearsQ
  const overviewQ = useQuery({ queryKey: ['fiscal-overview'], queryFn: portfolioApi.getFiscalOverview, staleTime: FISCAL_STALE_TIME })
  const { data: overview = [] } = overviewQ
  const carryforwardQ = useQuery({ queryKey: ['fiscal-carryforward'], queryFn: portfolioApi.getFiscalCarryforward, staleTime: FISCAL_STALE_TIME })
  const { data: carryforward } = carryforwardQ
  const calendarioQ = useQuery({ queryKey: ['fiscal-calendario'], queryFn: portfolioApi.getFiscalCalendar, staleTime: FISCAL_STALE_TIME })
  const { data: calendario } = calendarioQ
  // Ejercicios declarados (#311): sin caché larga, para ver los cambios tras una importación.
  const declaracionesQ = useQuery({ queryKey: ['fiscal-declaraciones'], queryFn: portfolioApi.getDeclaraciones })
  const { data: declaraciones = [] } = declaracionesQ

  const activeYear = selectedYear ?? (years.length > 0 ? years[0] : null)
  // Escala del ahorro de cada ejercicio (#452): la del activo y la del anterior, para compararlos.
  const tramos = useTramos(activeYear ?? undefined)
  const tramosPrev = useTramos((activeYear ?? new Date().getFullYear()) - 1)

  // Al cambiar de año se mantiene el anterior (atenuado) mientras llega el
  // nuevo, en vez de vaciar la página (#295). Con year 0 la consulta está
  // deshabilitada: solo sirve para tener claves válidas antes de saber el año.
  const q = fiscalYearQueries(activeYear ?? 0)
  const yearOpts = { enabled: !!activeYear, retry: false, placeholderData: keepPreviousData } as const
  const summaryQ0 = useQuery({ ...q.summary, ...yearOpts })
  const { data: summary, isLoading: summaryLoading, isError: summaryError, isPlaceholderData: switching } = summaryQ0
  const eventsQ0 = useQuery({ ...q.events, ...yearOpts })
  const { data: events, isLoading: eventsLoading, isError: eventsError } = eventsQ0
  const modelo721Q0 = useQuery({ ...q.modelo721, ...yearOpts })
  const { data: modelo721, isLoading: modelo721Loading, isError: modelo721Error } = modelo721Q0
  const breakdownQ0 = useQuery({ ...q.breakdown, ...yearOpts })
  const { data: breakdown = [], isError: breakdownError } = breakdownQ0
  const monthlyQ0 = useQuery({ ...q.monthly, ...yearOpts })
  const { data: monthly, isError: monthlyError } = monthlyQ0

  // Año en curso: el anterior «a estas alturas» (mismo día de Madrid) (#297).
  const enCurso = !!summary?.esAnioEnCurso && !switching
  const hasta = localMonthDay()
  const prevPeriodQ = useQuery({
    queryKey: ['fiscal-neto-hasta', (activeYear ?? 0) - 1, hasta],
    queryFn: () => portfolioApi.getFiscalNetoHasta((activeYear ?? 0) - 1, hasta),
    enabled: enCurso && !!activeYear && years.includes(activeYear - 1),
    staleTime: FISCAL_STALE_TIME,
  })
  const { data: prevPeriod } = prevPeriodQ
  // consulta de fondo (#498): sin el año anterior, la evolución mensual se muestra sin el interruptor de comparar.
  const prevMonthlyQ = useQuery({
    ...fiscalYearQueries((activeYear ?? 0) - 1).monthly,
    enabled: !!activeYear && years.includes(activeYear - 1),
  })
  const { data: prevMonthly } = prevMonthlyQ

  // Precarga del resto de años cuando la página queda libre: cambiar de año pasa a ser instantáneo.
  useEffect(() => {
    if (!activeYear || summaryLoading) return
    const run = () => {
      for (const y of prefetchOrder(years, activeYear)) {
        const p = fiscalYearQueries(y)
        void queryClient.prefetchQuery(p.summary)
        void queryClient.prefetchQuery(p.events)
        void queryClient.prefetchQuery(p.modelo721)
        void queryClient.prefetchQuery(p.breakdown)
        void queryClient.prefetchQuery(p.monthly)
      }
    }
    const idle = window.requestIdleCallback
    if (idle) {
      const id = idle(run, { timeout: 3000 })
      return () => window.cancelIdleCallback(id)
    }
    const t = window.setTimeout(run, 800)
    return () => window.clearTimeout(t)
  }, [years, activeYear, summaryLoading, queryClient])

  // La pestaña vive en la URL: sobrevive a recargar y responde al botón atrás.
  // Cambiar de pestaña a mano descarta los filtros que trajo un gráfico.
  const setVista = useCallback((v: FiscalVista) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      for (const k of ['desde', 'hasta', 'activo', 'resultado', 'seccion']) next.delete(k)
      if (v === 'resumen') next.delete('vista')
      else next.set('vista', v)
      return next
    })
  }, [setSearchParams])
  // Ejercicio elegido (#536): se refleja en ?anio= sin apilar historial, con el resto de la URL intacta.
  const elegirAnio = useCallback((y: number) => {
    setSelectedYear(y)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('anio', String(y))
      return next
    }, { replace: true })
  }, [setSearchParams])
  // Desde un gráfico: abre Operaciones ya filtrada (#301).
  const openOperaciones = useCallback((filters: Record<string, string>) => {
    setSearchParams({ vista: 'operaciones', ...(activeYear ? { anio: String(activeYear) } : {}), ...filters })
  }, [setSearchParams, activeYear])
  // Desde la comparativa (#539): Operaciones de otro ejercicio.
  const openOperacionesDe = useCallback((y: number) => {
    setSelectedYear(y)
    setSearchParams({ vista: 'operaciones', anio: String(y) })
  }, [setSearchParams])
  const urlFilters = filtersFromUrl(searchParams)

  // Tarjeta Rendimientos (#418): en Operaciones, baja a su tabla y le pasa el
  // foco en cuanto está pintada.
  const seccion = searchParams.get('seccion')
  useEffect(() => {
    if (vista !== 'operaciones' || seccion !== 'rendimientos' || !events) return
    const el = document.getElementById('fiscal-rendimientos')
    if (!el) return
    el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    el.focus({ preventScroll: true })
  }, [vista, seccion, events])

  // En pantallas estrechas la fila de pestañas se desplaza: la activa siempre a la vista.
  useEffect(() => {
    const el = document.getElementById(tabId(ID_BASE, vista))
    const row = el?.closest<HTMLElement>('[role="tablist"]')
    if (!el || !row || row.scrollWidth <= row.clientWidth) return
    const a = el.getBoundingClientRect(), r = row.getBoundingClientRect()
    row.scrollLeft += (a.left - r.left) - (r.width - a.width) / 2
  }, [vista, activeYear])

  // Desde el calendario: cada hito lleva a donde se trabaja (#309).
  const goHito = useCallback((h: FiscalHito) => {
    if (h.id === 'cierre') { setVista('planificar'); return }
    if (years.includes(h.ejercicio)) elegirAnio(h.ejercicio)
    setVista(h.id === 'modelo721' ? 'modelo721' : 'resumen')
  }, [setVista, years, elegirAnio])

  const onYearStep = useCallback((step: -1 | 1) => {
    if (!activeYear) return
    const next = adjacentYear(years, activeYear, step)
    if (next !== null) elegirAnio(next)
  }, [years, activeYear, elegirAnio])
  const onTab = useCallback((i: number) => { const v = FISCAL_VISTAS[i]; if (v) setVista(v) }, [setVista])
  useFiscalShortcuts({ onYearStep, onTab })

  const hasError = eventsError || breakdownError || monthlyError || summaryError || modelo721Error

  const retryFiscal = () => { void queryClient.refetchQueries({ predicate: q => String(q.queryKey[0]).startsWith('fiscal-') }) }
  // Sin la lista de ejercicios no se sabe si hay datos (#498): se dice antes que el vacío.
  if (yearsQ.isError) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <PageHeader icon={navIcon('/fiscal')} title="Fiscal" />
        <QueryError what="los ejercicios fiscales" error={yearsQ.error} onRetry={() => void yearsQ.refetch()} compact={false} />
      </div>
    )
  }
  if (hasError && activeYear) {
    const q0 = [summaryQ0, eventsQ0, modelo721Q0, breakdownQ0, monthlyQ0].find(q => q.isError)
    return (
      <div className="p-6">
        <QueryError what={`los datos fiscales de ${activeYear}`} error={q0?.error} onRetry={retryFiscal} compact={false} />
      </div>
    )
  }
  // Piezas secundarias (#498): un fallo se dice bajo la cabecera y el resto sigue.
  const falloSecundario = failure(overviewQ, carryforwardQ, calendarioQ, declaracionesQ, prevPeriodQ)

  // Sin ejercicios (#496): primer uso si no hay operaciones; si las hay, aún falta el cálculo FIFO.
  if (!activeYear) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <PageHeader icon={navIcon('/fiscal')} title="Fiscal" />
        {firstUse.empty
          ? <FirstUseEmpty what="tus ganancias, pérdidas y obligaciones fiscales" />
          : <EmptyState icon={<FileText size={32} />} title="Aún no hay ejercicios fiscales"
              description="Se calculan con el FIFO tras importar. Si acabas de importar, espera a que termine o ejecútalo en Ajustes, sección Datos." />}
      </div>
    )
  }

  const cfYear = carryforward?.detalle.find(d => d.year === activeYear)
  const baseCompensada = summary ? baseTramosCompensada(cfYear, summary.netoPatrimonial, summary.totalRendimientos) : 0
  const { cuota, tipoMedio } = cuotaAhorro(baseCompensada, tramos)

  // Comparación con el año anterior: mismo periodo en el año en curso; año completo si está cerrado.
  const ovPrev = overview.find(o => o.year === activeYear - 1)
  const cfPrev = carryforward?.detalle.find(d => d.year === activeYear - 1)
  const prevCuota = ovPrev ? cuotaAhorro(baseTramosCompensada(cfPrev, ovPrev.netoPatrimonial, ovPrev.totalRendimientos), tramosPrev).cuota : null
  const comparison = summary ? yearComparison({
    year: activeYear,
    esAnioEnCurso: summary.esAnioEnCurso,
    neto: summary.netoPatrimonial,
    cuota,
    prevNeto: summary.esAnioEnCurso ? prevPeriod?.neto ?? null : ovPrev?.netoPatrimonial ?? null,
    prevCuota,
  }) : null

  const rentaDeclarada = declaraciones.find(d => d.ejercicio === activeYear && d.tipo === 'renta')

  // Pérdidas que caducan este año: solo se avisa en la cabecera del año en curso (#305).
  const caducan = summary?.esAnioEnCurso && carryforward?.origenes
    ? caducanEsteAnio(carryforward.origenes, activeYear)
    : null

  // Menú lateral (#535): dato vivo, aviso y atajo de cada vista.
  const anioEnCurso = overview.find(o => o.esAnioEnCurso)?.year ?? null
  const estado721 = modelo721 ? modelo721Status(modelo721) : null
  const avisos = avisosVistas({
    rentaCambiada: (rentaDeclarada?.cambios?.length ?? 0) > 0,
    obligado721SinPresentar: estado721 === 'obligatorio' && !modelo721?.presentado,
  })
  const datoVivo: Record<FiscalVista, string | undefined> = {
    resumen: summary ? `Neto ${formatEur(summary.netoPatrimonial)}` : undefined,
    operaciones: events ? `${formatNumber(events.fiscalEvents.length, 0)} ${events.fiscalEvents.length === 1 ? 'operación' : 'operaciones'}` : undefined,
    modelo721: estado721 ? MODELO721_LABELS[estado721] : undefined,
    planificar: carryforward ? `${formatEur(carryforward.pendienteTotal)} de pérdidas pendientes` : undefined,
  }
  const navItems = FISCAL_VISTAS.map((v, i) => ({
    value: v, label: VISTA_LABELS[v], icon: VISTA_ICON[v], hint: datoVivo[v], shortcut: String(i + 1),
    badge: avisos[v] && (
      <span className="inline-flex text-warning-ink"><AlertTriangle size={12} aria-hidden="true" /><span className="sr-only">: requiere atención, {avisos[v]}</span></span>
    ),
  }))
  const ov = overview.find(o => o.year === activeYear)
  const m721 = modelo721 ? liveModelo721(modelo721, livePrices) : null
  const caducaEnCurso = anioEnCurso && carryforward?.origenes ? caducanEsteAnio(carryforward.origenes, anioEnCurso)?.importe ?? 0 : null
  const tono = (v: number) => (v > 0.005 ? 'positive' as const : v < -0.005 ? 'negative' as const : undefined)
  const cifras: Record<FiscalVista, StatStripCell[]> = {
    resumen: summary ? [
      // Tira pulsable (#537): cada cifra abre Operaciones con su filtro; el neto y la cuota van en el bloque.
      { key: 'ganancias', label: 'Ganancias', value: summary.totalGanancias, format: v => `+${formatEur(v)}`, tone: tono(summary.totalGanancias),
        onSelect: () => openOperaciones({ resultado: 'ganancia' }), destination: 'Operaciones' },
      { key: 'perdidas', label: 'Pérdidas', value: summary.totalPerdidas, format: formatEur, tone: tono(summary.totalPerdidas),
        onSelect: () => openOperaciones({ resultado: 'perdida' }), destination: 'Operaciones' },
      { key: 'rendimientos', label: 'Rendimientos', value: summary.totalRendimientos, format: formatEur,
        onSelect: () => openOperaciones({ seccion: 'rendimientos' }), destination: 'Operaciones' },
      { key: 'ops', label: 'Operaciones', value: summary.numOperacionesPatrimoniales + summary.numRendimientos, format: v => formatNumber(v, 0),
        onSelect: () => openOperaciones({}), destination: 'Operaciones' },
    ] : [],
    operaciones: ov ? [
      { key: 'ganancias', label: 'Ganancias', value: ov.totalGanancias, format: formatEur, tone: tono(ov.totalGanancias) },
      { key: 'perdidas', label: 'Pérdidas', value: ov.totalPerdidas, format: formatEur, tone: tono(ov.totalPerdidas) },
      { key: 'ops', label: 'Operaciones', value: ov.numOperaciones, format: v => formatNumber(v, 0) },
    ] : [],
    modelo721: m721 ? [
      { key: 'custodia', label: 'En custodia de terceros', value: m721.totalValorCustodia, format: formatEur },
      { key: 'umbral', label: 'Umbral', value: m721.umbral, format: formatEur },
      { key: 'margen', label: margenUmbral(m721) >= 0 ? 'Margen hasta el umbral' : 'Por encima del umbral', value: Math.abs(margenUmbral(m721)), format: formatEur,
        tone: margenUmbral(m721) < 0 ? 'warning' as const : undefined },
    ] : [],
    planificar: carryforward ? [
      { key: 'pendientes', label: 'Pérdidas pendientes', value: carryforward.pendienteTotal, format: formatEur },
      ...(planner ? [{ key: 'colchon', label: 'Colchón', value: planner.colchon, format: formatEur }] : []),
      ...(caducaEnCurso !== null ? [{ key: 'caducan', label: 'Caducan este año', value: caducaEnCurso, format: formatEur, tone: caducaEnCurso > 0.005 ? 'warning' as const : undefined }] : []),
    ] : [],
  }
  const declarados = new Set(declaraciones.filter(d => d.tipo === 'renta').map(d => d.ejercicio))
  const estadoActivo = estadoEjercicio(!!summary?.esAnioEnCurso, declarados.has(activeYear))

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        icon={navIcon('/fiscal')}
        title="Fiscal"
        badges={<EurOnlyBadge />}
        subtitle="Método FIFO · normativa española · importes en EUR"
      />

      {/* Nivel 1 de la norma de selección (#492, #535): menú lateral con URL (?vista=). */}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-8">
      <SectionNav items={navItems} value={vista} onChange={setVista} label="Secciones de Fiscal" idBase={ID_BASE} />

      <div id={tabPanelId(ID_BASE)} role="tabpanel" aria-labelledby={tabId(ID_BASE, vista)} aria-busy={switching}
        className="relative flex-1 min-w-0 space-y-5">
        {/* Cambio de año (#494): se mantienen las cifras del anterior y una barra indica la recarga. */}
        <RefreshBar active={switching} />
        {/* Cabecera de la vista (#491, #535, variante A): ejercicio, estado, años, exportar, cifras y enlace a Historial. */}
        <ViewHeader id="fiscal-vista-titulo" icon={VISTA_ICON[vista]} {...vistaHeader(vista, activeYear)}
          eyebrow={`Ejercicio ${vista === 'planificar' && anioEnCurso ? anioEnCurso : activeYear}`}
          badge={vista !== 'planificar' && <span className={badgeClasses(estadoActivo === 'por-declarar' ? 'warning' : estadoActivo === 'declarado' ? 'positive' : 'brand')}>{ESTADO_EJERCICIO_LABEL[estadoActivo]}</span>}
          actions={<>
            {/* En Resumen el selector son las tarjetas de ejercicio (#536), justo debajo. */}
            {vista !== 'resumen' && <YearTabs years={years} activeYear={activeYear} overview={overview} declarados={declarados} onSelect={elegirAnio} />}
            <ExportPanel year={activeYear} />
          </>}
          stats={cifras[vista]}
          footer={
            <Link to={historyYearLink(activeYear)} className="text-brand-ink hover:underline rounded focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
              Ver las operaciones de {activeYear} en Historial
            </Link>
          } />
        {falloSecundario && <QueryError what="parte de los datos fiscales" error={falloSecundario.error} onRetry={falloSecundario.retry}
          className="rounded-xl border border-border" />}
        {/* Planificar trabaja siempre con el año en curso, sea cual sea el seleccionado (#307) */}
        {vista === 'planificar' ? (
          <Block i={0}>
            {summary && !summary.esAnioEnCurso && (
              <p className="text-xs text-fg-subtle mb-3">El planificador trabaja con el ejercicio en curso, no con {activeYear}.</p>
            )}
            <PlanificadorTab />
          </Block>
        ) : summaryLoading ? (
          <FiscalHeroSkeleton />
        ) : summary && vista === 'resumen' ? (
          <>
            <YearCards years={years} activeYear={activeYear} overview={overview} declarados={declarados} onSelect={elegirAnio} />
            <FiscalHero summary={summary} cuota={cuota} tipoMedio={tipoMedio} comparison={comparison} aviso={caducan && <AvisoCaducidad {...caducan} compact />}
              declarada={!!rentaDeclarada} cf={cfYear} tramos={tramos}
              plazoRenta={calendario?.hitos.find(h => h.id === 'renta' && h.ejercicio === activeYear)} />
            {/* Estado de la declaración por pasos (#542), en los ejercicios cerrados. */}
            {!summary.esAnioEnCurso && (
              <Block i={1}>
                <EstadoDeclaracion year={activeYear} declaraciones={declaraciones}
                  datos={{ porRevisar: events?.fiscalEvents.filter(e => necesitaRevision(e) && !sinEfecto(e)).length ?? 0, preciosPendientes: summary.preciosPendientes }}
                  obligado721={modelo721?.obligado ?? null}
                  onVerRevisar={() => openOperaciones({ revisar: '1' })} onModelo721={() => setVista('modelo721')} />
              </Block>
            )}
            {calendario && (
              <Block i={1}>
                <CalendarioFiscal data={calendario} netoPorAnio={new Map(overview.map(o => [o.year, o.netoPatrimonial]))} onGo={goHito} />
              </Block>
            )}
            {/* Comparativa y evolución mensual en una fila en ancho grande (#539). */}
            {(overview.length >= 2 || (monthly && monthly.meses.length > 0)) && (
              <div className="grid gap-5 xl:grid-cols-2">
                {overview.length >= 2 && <Block i={1} className="[&>*]:h-full"><ComparativaAnual data={overview} activeYear={activeYear} onOpenYear={openOperacionesDe} /></Block>}
                {monthly && monthly.meses.length > 0 && (
                  <Block i={2} className="[&>*]:h-full">
                    <EvolucionMensual data={monthly} year={activeYear} previo={prevMonthly}
                      frenteAnterior={comparison ? { delta: comparison.netoDelta, label: comparison.label } : null}
                      onSelectMonth={m => openOperaciones(monthRange(activeYear, m))} />
                  </Block>
                )}
              </div>
            )}
            {breakdown.length > 0 && <Block i={3}><DesglosePorActivo data={breakdown} onSelectAsset={a => openOperaciones({ activo: a })} /></Block>}
            {carryforward && <Block i={4}><PerdidasPendientes data={carryforward} onPlanificar={() => setVista('planificar')} /></Block>}
          </>
        ) : summary && vista === 'operaciones' ? (
          eventsLoading ? (
            <div className={cardClasses('md')}><Skeleton className="h-4 w-64" /></div>
          ) : events && (
            <>
              {/* La clave remonta la tabla cuando un gráfico trae filtros nuevos */}
              <Block i={0}><TablaEventos key={JSON.stringify(urlFilters)} events={events.fiscalEvents} summary={summary} initialFilters={urlFilters} /></Block>
              {/* Rendimientos (#544): tira por tipo, gráfico mensual y las dos bases (#537) agrupadas por mes. */}
              <Block i={1}><SeccionRendimientos rendimientos={events.rendimientos} year={activeYear} /></Block>
            </>
          )
        ) : summary && vista === 'modelo721' ? (
          modelo721Loading ? (
            <div className={cardClasses('md')}><Skeleton className="h-4 w-48" /></div>
          ) : modelo721 && <Block i={0}><Modelo721Card data={modelo721} activeYear={activeYear} /></Block>
        ) : null}

        <PieMetodologia tema={TEMA_VISTA[vista]}>
          Método FIFO global por activo según la normativa española. Información orientativa: consulta con un asesor fiscal antes de presentar tu declaración.
        </PieMetodologia>
      </div>
      </div>
    </div>
  )
}
