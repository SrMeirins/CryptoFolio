import { useMemo, useRef, useState } from 'react'
import { Gauge } from 'lucide-react'
import { RangeSelector } from '../../components/RangeSelector'
import { NotApplicable, PanelHeader, QueryError, SegmentedControl, Skeleton, SkeletonGroup, panelSurface } from '../../components/ui'
import { PreparandoHistoricos } from '../../components/PreparandoHistoricos'
import { useCurrencyQuery } from '../../hooks/useCurrencyQuery'
import { useLiveDayPnl } from '../../hooks/useLiveDayPnl'
import { usePreparacionHistoricos } from '../../hooks/usePreparacionHistoricos'
import { useRangoUrl } from '../../hooks/useRangoUrl'
import { dailyPnlQuery } from '../../queries/currencyQueries'
import type { DiaValorado } from '../../utils/calendarioDietz'
import { localToday } from '../../utils/pnlChart'
import { resolverRango, textoRango, type RangoPreset, type RangoValor } from '../../utils/rangoGrafico'
import { extremosMeses, medidasRiesgo, rejillaPeriodos } from '../../utils/rendimiento'
import { fromDaily } from '../../utils/evolutionSeries'
import { applyLiveToday, steps } from '../../utils/evolutionSummary'
import { rebasarVentana } from '../../utils/evolucionVentana'
import { metricFor } from '../../utils/pnlChart'
import { dayMs } from '../../utils/chartAxes'
import { RejillaPeriodos } from './rendimiento/RejillaPeriodos'
import { VistaRiesgo } from './rendimiento/VistaRiesgo'

// Panel Rendimiento (#517), bajo Evolución: dos vistas sobre la misma
// historia diaria (la caché de Evolución y del P&L diario), con hoy en vivo.
// - Periodos: rentabilidad Dietz por mes, trimestre y año en tabla y mapa.
// - Riesgo: máxima caída con su recuperación, caída actual, volatilidad
//   anualizada y mejor y peor mes del rango elegido (selector común, en la
//   URL como ?rendimiento=; por defecto Todo).

type Vista = 'periodos' | 'riesgo'
const PRESETS: readonly RangoPreset[] = ['30d', '90d', '6m', '1a', 'anio', 'todo']
const DEFECTO: RangoValor = { tipo: 'preset', preset: 'todo' }

export function RendimientoCard() {
  const [vista, setVista] = useState<Vista>('periodos')
  const [rango, setRango] = useRangoUrl('rendimiento', PRESETS, DEFECTO)
  const panelRef = useRef<HTMLDivElement>(null)
  const today = localToday()
  const preparacion = usePreparacionHistoricos()
  const q = useCurrencyQuery(c => dailyPnlQuery(c), { refetchInterval: q2 => (q2.state.data?.refreshing ? 5_000 : 60_000) })
  const data = q.data
  const currency = data?.currency ?? q.currency
  const live = useLiveDayPnl(data?.today, currency)
  // Historia con hoy en vivo (valor y P&L), como el calendario.
  const historia: DiaValorado[] = useMemo(() => (data?.days ?? []).map(d =>
    d.live && live && data?.today?.date === d.date ? { ...d, pnl: Math.round(live.pnl * 100) / 100, pct: live.pct, value: live.value } : d,
  ), [data, live])
  const filas = useMemo(() => rejillaPeriodos(historia), [historia])
  const r = resolverRango(rango, today)
  const desde = r.from ?? data?.from ?? today
  // Rendimientos diarios de la ventana con las mismas reglas que Evolución (umbral de capital ínfimo y hoy en vivo).
  const riesgo = useMemo(() => {
    if (!data) return medidasRiesgo([])
    const puntos = rebasarVentana(applyLiveToday(fromDaily(data.days, 'Todo'), live, metricFor('Todo')), dayMs(desde), dayMs(r.to))
    const pasos = steps(puntos)
    return medidasRiesgo(pasos.map((p, i) => ({ date: new Date(p.x).toISOString().slice(0, 10), pct: p.pct, live: puntos[i].live })))
  }, [data, live, desde, r.to])
  const extremos = useMemo(() => extremosMeses(historia, desde, r.to), [historia, desde, r.to])

  return (
    // min-w-0: la tabla de periodos se desplaza dentro de su contenedor sin ensanchar el Dashboard.
    <div ref={panelRef} className={panelSurface('none', 'px-5 py-5 min-w-0')}>
      <PanelHeader
        icon={Gauge}
        title="Rendimiento"
        className="mb-4"
        subtitle={vista === 'periodos' ? 'Rentabilidad por mes, trimestre y año (Dietz modificado)' : `${textoRango(rango, today)}, sin contar depósitos ni retiradas`}
        help={<>
          <p>«Periodos» compara la rentabilidad de cada mes, trimestre y año con el método de Dietz modificado, el mismo que el calendario del P&L diario: pondera los depósitos y retiradas por el tiempo que estuvieron invertidos.</p>
          <p>«Riesgo» mide cuánto ha caído y oscilado la cartera en el periodo elegido.</p>
        </>}
        extra={<SegmentedControl label="Vista del rendimiento" variant="accent" value={vista} onChange={setVista}
          options={[{ value: 'periodos', label: 'Periodos' }, { value: 'riesgo', label: 'Riesgo' }]} />}
        actions={vista === 'riesgo'
          ? <RangeSelector value={rango} onChange={setRango} presets={PRESETS} defecto={DEFECTO} minDate={data?.from ?? null} label="rendimiento" scopeRef={panelRef} />
          : undefined}
      />
      {q.isError ? <QueryError what="el rendimiento" error={q.error} onRetry={() => void q.refetch()} />
        : !preparacion.listo ? <PreparandoHistoricos datos={preparacion.datos} />
        : !data ? (
          <SkeletonGroup label="Cargando el rendimiento" className="space-y-2">
            {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </SkeletonGroup>
        ) : filas.length === 0 ? <NotApplicable>Sin historia para medir el rendimiento.</NotApplicable>
        : vista === 'periodos' ? <div key="periodos" className="animate-page-in"><RejillaPeriodos filas={filas} currency={currency} /></div>
        : <div key="riesgo" className="animate-page-in"><VistaRiesgo riesgo={riesgo} mejor={extremos.mejor} peor={extremos.peor} currency={currency} /></div>}
    </div>
  )
}
