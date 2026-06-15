import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, Info, Calendar, AlertTriangle } from 'lucide-react'
import { formatEur, pnlColor } from '../utils/format'
import { pnlBg } from './fiscal/helpers'
import { ComparativaAnual, EvolucionMensual, DesglosePorActivo } from './fiscal/Charts'
import { TramosIRPF, CompensacionPerdidas } from './fiscal/TaxCards'
import { Modelo721Card } from './fiscal/Modelo721Card'
import { TablaEventos } from './fiscal/TablaEventos'
import { TablaRendimientos } from './fiscal/TablaRendimientos'
import { ExportPanel } from './fiscal/ExportPanel'
import type {
  FiscalSummary, FiscalEvent, RendimientoEvent, Modelo721,
  YearOverview, Carryforward, BreakdownItem, MonthlyData,
} from './fiscal/types'

async function fetchOk(url: string) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`)
  return r.json()
}

export function Fiscal() {
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const currentYear = new Date().getFullYear()

  const { data: years = [] } = useQuery<number[]>({
    queryKey: ['fiscal-years'],
    queryFn: () => fetchOk('/api/fiscal/years'),
  })

  const { data: overview = [] } = useQuery<YearOverview[]>({
    queryKey: ['fiscal-overview'],
    queryFn: () => fetchOk('/api/fiscal/overview'),
    staleTime: 5 * 60_000,
  })

  const { data: carryforward } = useQuery<Carryforward>({
    queryKey: ['fiscal-carryforward'],
    queryFn: () => fetchOk('/api/fiscal/carryforward'),
    staleTime: 5 * 60_000,
  })

  const activeYear = selectedYear ?? (years.length > 0 ? years[0] : null)

  const { data: summary, isLoading: summaryLoading } = useQuery<FiscalSummary>({
    queryKey: ['fiscal-summary-detail', activeYear],
    queryFn: () => fetchOk(`/api/fiscal/${activeYear}/summary`),
    enabled: !!activeYear,
    staleTime: 5 * 60_000,
  })

  const { data: events, isLoading: eventsLoading, isError: eventsError } = useQuery<{
    fiscalEvents: FiscalEvent[]
    rendimientos: RendimientoEvent[]
  }>({
    queryKey: ['fiscal-events', activeYear],
    queryFn: () => fetchOk(`/api/fiscal/${activeYear}/events`),
    enabled: !!activeYear,
    staleTime: 5 * 60_000,
    retry: false,
  })

  const { data: modelo721, isLoading: modelo721Loading } = useQuery<Modelo721>({
    queryKey: ['fiscal-721', activeYear],
    queryFn: () => fetchOk(`/api/fiscal/${activeYear}/modelo721`),
    enabled: !!activeYear,
    staleTime: 5 * 60_000,
    retry: false,
  })

  const { data: breakdown = [], isError: breakdownError } = useQuery<BreakdownItem[]>({
    queryKey: ['fiscal-breakdown', activeYear],
    queryFn: () => fetchOk(`/api/fiscal/${activeYear}/breakdown`),
    enabled: !!activeYear,
    staleTime: 5 * 60_000,
    retry: false,
  })

  const { data: monthly, isError: monthlyError } = useQuery<MonthlyData>({
    queryKey: ['fiscal-monthly', activeYear],
    queryFn: () => fetchOk(`/api/fiscal/${activeYear}/monthly`),
    enabled: !!activeYear,
    staleTime: 5 * 60_000,
    retry: false,
  })

  const hasError = eventsError || breakdownError || monthlyError

  if (hasError && activeYear) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-64 gap-3">
        <AlertTriangle size={32} className="text-accent-red" />
        <p className="text-gray-300 text-sm font-medium">Error al cargar los datos fiscales de {activeYear}</p>
        <p className="text-gray-600 text-xs">Inténtalo de nuevo en unos segundos.</p>
      </div>
    )
  }

  if (!activeYear) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-64 gap-3">
        <FileText size={32} className="text-gray-600" />
        <p className="text-gray-500 text-sm">No hay datos fiscales disponibles.</p>
        <p className="text-gray-600 text-xs">Importa transacciones y ejecuta el motor FIFO primero.</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Módulo Fiscal</h1>
          <p className="text-xs text-gray-500 mt-0.5">Método FIFO · Normativa española vigente</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-[11px] text-gray-600">
            <Info size={11} />
            Información orientativa
          </div>
          {activeYear && <ExportPanel year={activeYear} />}
        </div>
      </div>

      {/* Tabs por año */}
      <div className="flex gap-2 flex-wrap">
        {years.map((year: number) => {
          const ov   = overview.find(o => o.year === year)
          const neto = ov?.netoPatrimonial ?? 0
          return (
            <button
              key={year}
              onClick={() => setSelectedYear(year)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeYear === year
                  ? 'bg-accent-blue/20 border border-accent-blue/40 text-white'
                  : 'bg-background-tertiary border border-border text-gray-400 hover:text-white hover:border-gray-500'
              }`}
            >
              <span>{year}</span>
              {year === currentYear && (
                <span className="text-[10px] bg-accent-blue/20 text-accent-blue px-1.5 py-0.5 rounded-full">EN CURSO</span>
              )}
              {ov && (
                <span className={`text-[10px] font-mono font-bold ${neto >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                  {neto >= 0 ? '+' : ''}{formatEur(neto)}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {overview.length >= 2 && <ComparativaAnual data={overview} />}

      {summaryLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-background-card border border-border rounded-2xl p-5 animate-pulse">
              <div className="h-3 bg-background-tertiary rounded w-3/4 mb-3" />
              <div className="h-7 bg-background-tertiary rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={`bg-background-card border rounded-2xl p-5 ${pnlBg(summary.totalGanancias)}`}>
              <div className="text-[11px] text-gray-500 uppercase tracking-widest mb-2">Ganancias</div>
              <div className="text-xl font-bold mono text-accent-green">+{formatEur(summary.totalGanancias)}</div>
              <div className="text-[10px] text-gray-600 mt-1.5">Base del ahorro IRPF</div>
            </div>

            <div className={`bg-background-card border rounded-2xl p-5 ${pnlBg(summary.totalPerdidas)}`}>
              <div className="text-[11px] text-gray-500 uppercase tracking-widest mb-2">Pérdidas</div>
              <div className="text-xl font-bold mono text-accent-red">{formatEur(summary.totalPerdidas)}</div>
              <div className="text-[10px] text-gray-600 mt-1.5">Compensables 4 años</div>
            </div>

            <div className={`bg-background-card border rounded-2xl p-5 ${pnlBg(summary.netoPatrimonial)}`}>
              <div className="text-[11px] text-gray-500 uppercase tracking-widest mb-2">Neto a declarar</div>
              <div className={`text-xl font-bold mono ${pnlColor(summary.netoPatrimonial)}`}>
                {summary.netoPatrimonial >= 0 ? '+' : ''}{formatEur(summary.netoPatrimonial)}
              </div>
              <div className="text-[10px] text-gray-600 mt-1.5">{summary.numOperacionesPatrimoniales} operaciones</div>
              {summary.esAnioEnCurso && (
                <div className="text-[10px] text-accent-blue mt-1 flex items-center gap-1">
                  <Calendar size={9} />
                  Año en curso · hasta hoy
                </div>
              )}
            </div>

            <div className="bg-background-card border border-border rounded-2xl p-5">
              <div className="text-[11px] text-gray-500 uppercase tracking-widest mb-2">Rendimientos</div>
              <div className="text-xl font-bold mono text-accent-amber">{formatEur(summary.totalRendimientos)}</div>
              <div className="text-[10px] text-gray-600 mt-1.5">{summary.numRendimientos} operaciones</div>
            </div>
          </div>

          {monthly && monthly.meses.length > 1 && (
            <EvolucionMensual data={monthly} esAnioEnCurso={summary.esAnioEnCurso} />
          )}

          {breakdown.length > 0 && <DesglosePorActivo data={breakdown} />}
          {summary.netoPatrimonial > 0 && (
            <TramosIRPF
              base={summary.netoPatrimonial + summary.totalRendimientos}
              label={`Tramos IRPF — estimación ${activeYear}`}
            />
          )}

          {carryforward && <CompensacionPerdidas data={carryforward} />}

          {modelo721Loading ? (
            <div className="bg-background-card border border-border rounded-2xl p-5 animate-pulse">
              <div className="h-4 bg-background-tertiary rounded w-48" />
            </div>
          ) : modelo721 && (
            <Modelo721Card data={modelo721} activeYear={activeYear} />
          )}

          {eventsLoading ? (
            <div className="bg-background-card border border-border rounded-2xl p-5 animate-pulse">
              <div className="h-4 bg-background-tertiary rounded w-64" />
            </div>
          ) : events && (
            <>
              <TablaEventos events={events.fiscalEvents} summary={summary} year={activeYear} />
              <TablaRendimientos rendimientos={events.rendimientos} year={activeYear} />
            </>
          )}
        </>
      )}

      <div className="flex items-start gap-2 p-4 bg-background-tertiary/50 rounded-2xl text-[11px] text-gray-600 border border-border">
        <Info size={12} className="shrink-0 mt-0.5" />
        Información orientativa. Los cálculos se basan en el método FIFO según la normativa española vigente.
        Consulta con un asesor fiscal antes de presentar tu declaración de la renta.
      </div>
    </div>
  )
}
