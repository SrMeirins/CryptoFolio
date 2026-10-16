import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Info } from 'lucide-react'
import { portfolioApi } from '../api/portfolio'
import { FISCAL_STALE_TIME } from './fiscal/constants'
import { fiscalYearQueries, prefetchOrder } from './fiscal/fiscalYearQueries'
import { baseTramosCompensada } from '../utils/tramosIrpf'
import { ComparativaAnual, EvolucionMensual, DesglosePorActivo } from './fiscal/Charts'
import { TramosIRPF, CompensacionPerdidas } from './fiscal/TaxCards'
import { Modelo721Card } from './fiscal/Modelo721Card'
import { TablaEventos } from './fiscal/TablaEventos'
import { TablaRendimientos } from './fiscal/TablaRendimientos'
import { ExportPanel } from './fiscal/ExportPanel'
import { YearTabs } from './fiscal/YearTabs'
import { FiscalSummaryCards, FiscalSummaryCardsSkeleton } from './fiscal/FiscalSummaryCards'
import { EurOnlyBadge } from '../components/EurOnlyBadge'
import { cardClasses, EmptyState, ErrorState, Skeleton, PageHeader } from '../components/ui'
import { navIcon } from '../constants/navigation'

export function Fiscal() {
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const queryClient = useQueryClient()
  const currentYear = new Date().getFullYear()

  const { data: years = [] } = useQuery({
    queryKey: ['fiscal-years'],
    queryFn: portfolioApi.getFiscalYears,
  })

  const { data: overview = [] } = useQuery({
    queryKey: ['fiscal-overview'],
    queryFn: portfolioApi.getFiscalOverview,
    staleTime: FISCAL_STALE_TIME,
  })

  const { data: carryforward } = useQuery({
    queryKey: ['fiscal-carryforward'],
    queryFn: portfolioApi.getFiscalCarryforward,
    staleTime: FISCAL_STALE_TIME,
  })

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

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">

      {/* Header */}
      <PageHeader
        icon={navIcon('/fiscal')}
        title="Fiscal"
        badges={<EurOnlyBadge />}
        subtitle="Método FIFO · normativa española · importes en EUR"
        actions={
          <>
            <ExportPanel year={activeYear} />
          </>
        }
      />

      <YearTabs years={years} activeYear={activeYear} overview={overview} currentYear={currentYear} onSelect={setSelectedYear} />

      {overview.length >= 2 && <ComparativaAnual data={overview} />}

      <div aria-busy={switching} className={`space-y-5 transition-opacity duration-200 ${switching ? 'opacity-60' : ''}`}>
      {summaryLoading ? (
        <FiscalSummaryCardsSkeleton />
      ) : summary && (
        <>
          <FiscalSummaryCards summary={summary} />

          {monthly && monthly.meses.length > 1 && (
            <EvolucionMensual data={monthly} esAnioEnCurso={summary.esAnioEnCurso} />
          )}

          {breakdown.length > 0 && <DesglosePorActivo data={breakdown} />}
          {baseCompensada > 0 && (
            <TramosIRPF
              base={baseCompensada}
              label={`Tramos IRPF — estimación ${activeYear}${huboCompensacion ? ' (tras compensar pérdidas)' : ''}`}
            />
          )}

          {carryforward && <CompensacionPerdidas data={carryforward} />}

          {modelo721Loading ? (
            <div className={cardClasses('md')}><Skeleton className="h-4 w-48" /></div>
          ) : modelo721 && (
            <Modelo721Card data={modelo721} activeYear={activeYear} />
          )}

          {eventsLoading ? (
            <div className={cardClasses('md')}><Skeleton className="h-4 w-64" /></div>
          ) : events && (
            <>
              <TablaEventos events={events.fiscalEvents} summary={summary} />
              <TablaRendimientos rendimientos={events.rendimientos} year={activeYear} />
            </>
          )}
        </>
      )}
      </div>

      <div className="flex items-start gap-2 p-4 bg-background-tertiary/50 rounded-xl text-xs text-fg-subtle border border-border">
        <Info size={12} className="shrink-0 mt-0.5" />
        Información orientativa. Los cálculos se basan en el método FIFO según la normativa española vigente.
        Consulta con un asesor fiscal antes de presentar tu declaración de la renta.
      </div>
    </div>
  )
}
