import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Info } from 'lucide-react'
import { portfolioApi } from '../api/portfolio'
import { FISCAL_STALE_TIME } from './fiscal/constants'
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

  // activeYear! en las queryFn: no-null assertion segura — `enabled: !!activeYear`
  // garantiza que React Query nunca las ejecuta con activeYear a null.
  const { data: summary, isLoading: summaryLoading, isError: summaryError } = useQuery({
    queryKey: ['fiscal-summary-detail', activeYear],
    queryFn: () => portfolioApi.getFiscalSummaryDetail(activeYear!),
    enabled: !!activeYear,
    staleTime: FISCAL_STALE_TIME,
    retry: false,
  })

  const { data: events, isLoading: eventsLoading, isError: eventsError } = useQuery({
    queryKey: ['fiscal-events', activeYear],
    queryFn: () => portfolioApi.getFiscalEvents(activeYear!),
    enabled: !!activeYear,
    staleTime: FISCAL_STALE_TIME,
    retry: false,
  })

  const { data: modelo721, isLoading: modelo721Loading, isError: modelo721Error } = useQuery({
    queryKey: ['fiscal-721', activeYear],
    queryFn: () => portfolioApi.getFiscalModelo721(activeYear!),
    enabled: !!activeYear,
    staleTime: FISCAL_STALE_TIME,
    retry: false,
  })

  const { data: breakdown = [], isError: breakdownError } = useQuery({
    queryKey: ['fiscal-breakdown', activeYear],
    queryFn: () => portfolioApi.getFiscalBreakdown(activeYear!),
    enabled: !!activeYear,
    staleTime: FISCAL_STALE_TIME,
    retry: false,
  })

  const { data: monthly, isError: monthlyError } = useQuery({
    queryKey: ['fiscal-monthly', activeYear],
    queryFn: () => portfolioApi.getFiscalMonthly(activeYear!),
    enabled: !!activeYear,
    staleTime: FISCAL_STALE_TIME,
    retry: false,
  })

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
            <div className="flex items-center gap-1 text-xs text-fg-subtle">
              <Info size={11} />
              Información orientativa
            </div>
            <ExportPanel year={activeYear} />
          </>
        }
      />

      <YearTabs years={years} activeYear={activeYear} overview={overview} currentYear={currentYear} onSelect={setSelectedYear} />

      {overview.length >= 2 && <ComparativaAnual data={overview} />}

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

      <div className="flex items-start gap-2 p-4 bg-background-tertiary/50 rounded-xl text-xs text-fg-subtle border border-border">
        <Info size={12} className="shrink-0 mt-0.5" />
        Información orientativa. Los cálculos se basan en el método FIFO según la normativa española vigente.
        Consulta con un asesor fiscal antes de presentar tu declaración de la renta.
      </div>
    </div>
  )
}
