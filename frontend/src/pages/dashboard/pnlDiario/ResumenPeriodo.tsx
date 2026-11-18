import { useMemo, useState } from 'react'
import { NotApplicable, SegmentedControl, Skeleton, SkeletonGroup } from '../../../components/ui'
import { useCurrencyQuery } from '../../../hooks/useCurrencyQuery'
import { useLiveDayPnl } from '../../../hooks/useLiveDayPnl'
import { usePrivacyStore } from '../../../store/privacyStore'
import { dailyPnlQuery } from '../../../queries/currencyQueries'
import { fromDaily } from '../../../utils/evolutionSeries'
import { applyLiveToday } from '../../../utils/evolutionSummary'
import { rebasarVentana } from '../../../utils/evolucionVentana'
import { metricFor } from '../../../utils/pnlChart'
import { dayMs } from '../../../utils/chartAxes'
import { diasEntre, resolverRango, serializarRango, type RangoValor } from '../../../utils/rangoGrafico'
import { agrupacionAuto, barrasPeriodo, diasDelPeriodo, resumenPeriodo, type Agrupacion, type BarraPnl } from '../../../utils/pnlPeriodo'
import { nombreAgrupacion } from '../../../utils/pnlPeriodoTexto'
import { CabeceraPeriodo } from './CabeceraPeriodo'
import { TiraPeriodo } from './TiraPeriodo'
import { BarrasPnl } from './BarrasPnl'

// Resumen del periodo del panel P&L diario (#511): cabecera con el acumulado,
// tira de métricas y gráfico de barras con el acumulado, sobre el rango del
// selector común. Usa toda la historia diaria (la misma caché que Evolución y
// las tarjetas) con hoy en vivo, así que cambiar de rango es inmediato. El %
// del periodo se recalcula con las reglas de Evolución para que coincidan.

const AGRUPACIONES: { value: Agrupacion; label: string }[] = [
  { value: 'dia', label: 'Día' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
]

export function ResumenPeriodo({ rango, today, onHover, onOpenDay, onOpenMonth }: {
  rango: RangoValor
  today: string
  onHover?: (date: string | null) => void
  /** Abre un día en el calendario con su detalle. */
  onOpenDay: (date: string) => void
  /** Lleva el calendario al mes de una fecha (barras de semana o mes). */
  onOpenMonth: (date: string) => void
}) {
  const oculto = usePrivacyStore(s => s.hidden)
  // consulta de fondo (#498): su fallo lo muestra el panel, que consulta la misma serie.
  const q = useCurrencyQuery(c => dailyPnlQuery(c), { refetchInterval: q2 => (q2.state.data?.refreshing ? 5_000 : 60_000) })
  const data = q.data
  const currency = data?.currency ?? q.currency
  const live = useLiveDayPnl(data?.today, currency)

  // Días con hoy en vivo, como en el calendario.
  const dias = useMemo(() => (data?.days ?? []).map(d =>
    d.live && live && data?.today?.date === d.date ? { ...d, pnl: Math.round(live.pnl * 100) / 100, pct: live.pct } : d,
  ), [data, live])
  const r = resolverRango(rango, today)
  const desde = r.from ?? data?.from ?? today
  const enPeriodo = useMemo(() => diasDelPeriodo(dias, r.from, r.to), [dias, r.from, r.to])
  const resumen = useMemo(() => resumenPeriodo(enPeriodo), [enPeriodo])

  // % del periodo con las reglas de Evolución (P&L sobre el pico de capital aportado).
  const pct = useMemo(() => {
    if (!data) return null
    const full = applyLiveToday(fromDaily(data.days, 'Todo'), live, metricFor('Todo'))
    const ventana = rebasarVentana(full, dayMs(desde), dayMs(r.to))
    return ventana.length ? ventana[ventana.length - 1].pct : null
  }, [data, live, desde, r.to])

  // Agrupación automática según el rango; la elegida a mano dura hasta cambiar de rango.
  const claveRango = serializarRango(rango)
  const [manual, setManual] = useState<{ rango: string; a: Agrupacion } | null>(null)
  const auto = agrupacionAuto(diasEntre(desde, r.to) + 1)
  const agrupacion = manual?.rango === claveRango ? manual.a : auto
  const barras = useMemo(() => barrasPeriodo(enPeriodo, agrupacion), [enPeriodo, agrupacion])
  const conHoy = enPeriodo.some(d => d.live)

  const abrir = (b: BarraPnl) => (agrupacion === 'dia' ? onOpenDay(b.desde) : onOpenMonth(b.desde))

  if (!data) {
    return (
      <SkeletonGroup label="Cargando el periodo" className="space-y-3">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-[220px] w-full" />
      </SkeletonGroup>
    )
  }
  if (enPeriodo.length === 0) {
    return <NotApplicable className="py-8 flex justify-center">Sin días con datos en este periodo.</NotApplicable>
  }
  return (
    <div className="space-y-3">
      <CabeceraPeriodo resumen={resumen} pct={pct} currency={currency} conHoy={conHoy} />
      <TiraPeriodo resumen={resumen} currency={currency} onOpenDay={onOpenDay} />
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
          <p className="flex items-center gap-3 text-[11px] text-fg-subtle">
            <span className="flex items-center gap-1.5"><span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-sm bg-positive" /><span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-sm bg-negative -ml-1" />P&L por {nombreAgrupacion(agrupacion)}</span>
            <span className="flex items-center gap-1.5"><span aria-hidden="true" className="inline-block w-3.5 h-0.5 rounded-full bg-brand" />Acumulado (eje derecho)</span>
          </p>
          <SegmentedControl label="Agrupar las barras por" value={agrupacion} onChange={a => setManual({ rango: claveRango, a })} options={AGRUPACIONES} />
        </div>
        <BarrasPnl barras={barras} agrupacion={agrupacion} currency={currency} oculto={oculto}
          animationKey={`${claveRango}-${agrupacion}`} onHover={onHover} onAbrir={abrir} />
      </div>
    </div>
  )
}
