import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { FileText, Info } from 'lucide-react'
import { portfolioApi } from '../api/portfolio'
import { FISCAL_STALE_TIME } from './fiscal/constants'
import { fiscalYearQueries, prefetchOrder } from './fiscal/fiscalYearQueries'
import { baseTramosCompensada } from '../utils/tramosIrpf'
import { adjacentYear, cuotaAhorro, FISCAL_VISTAS, madridMonthDay, parseVista, yearComparison, type FiscalVista } from '../utils/fiscalHeader'
import { useTramos } from '../hooks/useTramos'
import { ComparativaAnual, EvolucionMensual, DesglosePorActivo } from './fiscal/Charts'
import { TramosIRPF, CompensacionPerdidas } from './fiscal/TaxCards'
import { Modelo721Card } from './fiscal/Modelo721Card'
import { TablaEventos } from './fiscal/TablaEventos'
import { TablaRendimientos } from './fiscal/TablaRendimientos'
import { ExportPanel } from './fiscal/ExportPanel'
import { YearTabs } from './fiscal/YearTabs'
import { FiscalHero, FiscalHeroSkeleton } from './fiscal/FiscalHero'
import { useFiscalShortcuts } from './fiscal/useFiscalShortcuts'
import { EurOnlyBadge } from '../components/EurOnlyBadge'
import { cardClasses, EmptyState, ErrorState, Skeleton, PageHeader, Tabs, panelEnterStyle, tabId, tabPanelId } from '../components/ui'
import { navIcon } from '../constants/navigation'

const VISTA_LABELS: Record<FiscalVista, string> = { resumen: 'Resumen', operaciones: 'Operaciones', modelo721: 'Modelo 721' }
const TAB_ITEMS = FISCAL_VISTAS.map((v, i) => ({ value: v, label: <span title={`Atajo: ${i + 1}`}>{VISTA_LABELS[v]}</span> }))
const ID_BASE = 'fiscal-vista'

/** Bloque con la entrada escalonada de paneles (#297). */
function Block({ i, children }: { i: number; children: ReactNode }) {
  return <div className="panel-in" style={panelEnterStyle(i)}>{children}</div>
}

export function Fiscal() {
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const vista = parseVista(searchParams.get('vista'))
  const queryClient = useQueryClient()
  const tramos = useTramos()

  const { data: years = [] } = useQuery({ queryKey: ['fiscal-years'], queryFn: portfolioApi.getFiscalYears })
  const { data: overview = [] } = useQuery({ queryKey: ['fiscal-overview'], queryFn: portfolioApi.getFiscalOverview, staleTime: FISCAL_STALE_TIME })
  const { data: carryforward } = useQuery({ queryKey: ['fiscal-carryforward'], queryFn: portfolioApi.getFiscalCarryforward, staleTime: FISCAL_STALE_TIME })

  const activeYear = selectedYear ?? (years.length > 0 ? years[0] : null)

  // Al cambiar de año se mantiene el anterior (atenuado) mientras llega el
  // nuevo, en vez de vaciar la página (#295). Con year 0 la consulta está
  // deshabilitada: solo sirve para tener claves válidas antes de saber el año.
  const q = fiscalYearQueries(activeYear ?? 0)
  const yearOpts = { enabled: !!activeYear, retry: false, placeholderData: keepPreviousData } as const
  const { data: summary, isLoading: summaryLoading, isError: summaryError, isPlaceholderData: switching } = useQuery({ ...q.summary, ...yearOpts })
  const { data: events, isLoading: eventsLoading, isError: eventsError } = useQuery({ ...q.events, ...yearOpts })
  const { data: modelo721, isLoading: modelo721Loading, isError: modelo721Error } = useQuery({ ...q.modelo721, ...yearOpts })
  const { data: breakdown = [], isError: breakdownError } = useQuery({ ...q.breakdown, ...yearOpts })
  const { data: monthly, isError: monthlyError } = useQuery({ ...q.monthly, ...yearOpts })

  // Año en curso: el anterior «a estas alturas» (mismo día de Madrid) (#297).
  const enCurso = !!summary?.esAnioEnCurso && !switching
  const hasta = madridMonthDay()
  const { data: prevPeriod } = useQuery({
    queryKey: ['fiscal-neto-hasta', (activeYear ?? 0) - 1, hasta],
    queryFn: () => portfolioApi.getFiscalNetoHasta((activeYear ?? 0) - 1, hasta),
    enabled: enCurso && !!activeYear && years.includes(activeYear - 1),
    staleTime: FISCAL_STALE_TIME,
  })

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
  const setVista = useCallback((v: FiscalVista) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (v === 'resumen') next.delete('vista')
      else next.set('vista', v)
      return next
    })
  }, [setSearchParams])

  const onYearStep = useCallback((step: -1 | 1) => {
    if (!activeYear) return
    const next = adjacentYear(years, activeYear, step)
    if (next !== null) setSelectedYear(next)
  }, [years, activeYear])
  const onTab = useCallback((i: number) => { const v = FISCAL_VISTAS[i]; if (v) setVista(v) }, [setVista])
  useFiscalShortcuts({ onYearStep, onTab })

  const hasError = eventsError || breakdownError || monthlyError || summaryError || modelo721Error

  if (hasError && activeYear) {
    return (
      <div className="p-6">
        <ErrorState
          title={`Error al cargar los datos fiscales de ${activeYear}`}
          description="Inténtalo de nuevo en unos segundos."
          onRetry={() => queryClient.refetchQueries({ predicate: q => String(q.queryKey[0]).startsWith('fiscal-') })}
        />
      </div>
    )
  }

  if (!activeYear) {
    return (
      <div className="p-6">
        <EmptyState icon={<FileText size={32} />} title="No hay datos fiscales disponibles." description="Importa transacciones y ejecuta el motor FIFO primero." />
      </div>
    )
  }

  const cfYear = carryforward?.detalle.find(d => d.year === activeYear)
  const baseCompensada = summary ? baseTramosCompensada(cfYear, summary.netoPatrimonial, summary.totalRendimientos) : 0
  const huboCompensacion = !!cfYear && cfYear.compensado > 0.01
  const { cuota, tipoMedio } = cuotaAhorro(baseCompensada, tramos)

  // Comparación con el año anterior: mismo periodo en el año en curso; año completo si está cerrado.
  const ovPrev = overview.find(o => o.year === activeYear - 1)
  const cfPrev = carryforward?.detalle.find(d => d.year === activeYear - 1)
  const prevCuota = ovPrev ? cuotaAhorro(baseTramosCompensada(cfPrev, ovPrev.netoPatrimonial, ovPrev.totalRendimientos), tramos).cuota : null
  const comparison = summary ? yearComparison({
    year: activeYear,
    esAnioEnCurso: summary.esAnioEnCurso,
    neto: summary.netoPatrimonial,
    cuota,
    prevNeto: summary.esAnioEnCurso ? prevPeriod?.neto ?? null : ovPrev?.netoPatrimonial ?? null,
    prevCuota,
  }) : null

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <PageHeader
        icon={navIcon('/fiscal')}
        title="Fiscal"
        badges={<EurOnlyBadge />}
        subtitle="Método FIFO · normativa española · importes en EUR"
        actions={<ExportPanel year={activeYear} />}
      />

      <YearTabs years={years} activeYear={activeYear} overview={overview} onSelect={setSelectedYear} />

      <Tabs items={TAB_ITEMS} value={vista} onChange={setVista} label="Secciones de Fiscal" idBase={ID_BASE} variant="underline" />

      <div id={tabPanelId(ID_BASE)} role="tabpanel" aria-labelledby={tabId(ID_BASE, vista)} aria-busy={switching}
        className={`space-y-5 transition-opacity duration-200 ${switching ? 'opacity-60' : ''}`}>
        {summaryLoading ? (
          <FiscalHeroSkeleton />
        ) : summary && vista === 'resumen' ? (
          <>
            <FiscalHero summary={summary} cuota={cuota} tipoMedio={tipoMedio} comparison={comparison} />
            {overview.length >= 2 && <Block i={1}><ComparativaAnual data={overview} /></Block>}
            {monthly && monthly.meses.length > 1 && (
              <Block i={2}><EvolucionMensual data={monthly} esAnioEnCurso={summary.esAnioEnCurso} /></Block>
            )}
            {breakdown.length > 0 && <Block i={3}><DesglosePorActivo data={breakdown} /></Block>}
            {baseCompensada > 0 && (
              <Block i={4}>
                <TramosIRPF base={baseCompensada} label={`Tramos IRPF — estimación ${activeYear}${huboCompensacion ? ' (tras compensar pérdidas)' : ''}`} />
              </Block>
            )}
            {carryforward && <Block i={5}><CompensacionPerdidas data={carryforward} /></Block>}
          </>
        ) : summary && vista === 'operaciones' ? (
          eventsLoading ? (
            <div className={cardClasses('md')}><Skeleton className="h-4 w-64" /></div>
          ) : events && (
            <>
              <Block i={0}><TablaEventos events={events.fiscalEvents} summary={summary} /></Block>
              <Block i={1}><TablaRendimientos rendimientos={events.rendimientos} year={activeYear} /></Block>
            </>
          )
        ) : summary && vista === 'modelo721' ? (
          modelo721Loading ? (
            <div className={cardClasses('md')}><Skeleton className="h-4 w-48" /></div>
          ) : modelo721 && <Block i={0}><Modelo721Card data={modelo721} activeYear={activeYear} /></Block>
        ) : null}
      </div>

      <div className="flex items-start gap-2 p-4 bg-background-tertiary/50 rounded-xl text-xs text-fg-subtle border border-border">
        <Info size={12} className="shrink-0 mt-0.5" />
        Información orientativa. Los cálculos se basan en el método FIFO según la normativa española vigente.
        Consulta con un asesor fiscal antes de presentar tu declaración de la renta.
      </div>
    </div>
  )
}
