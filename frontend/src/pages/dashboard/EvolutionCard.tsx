import { useMemo, useRef, useState } from 'react'
import { PnlChart, type PnlUnit } from './PnlChart'
import { ValueChart } from './ValueChart'
import { EvolutionSummary } from './EvolutionSummary'
import { CalendarDayDetail } from './calendar/CalendarDayDetail'
import { RangeSelector } from '../../components/RangeSelector'
import { useRangoUrl } from '../../hooks/useRangoUrl'
import { resolverRango, serializarRango, textoRango, type RangoPreset, type RangoValor } from '../../utils/rangoGrafico'
import { SegmentedControl, PanelHeader, panelSurface, RefreshBar } from '../../components/ui'
import { useCurrencyQuery } from '../../hooks/useCurrencyQuery'
import { usePreparacionHistoricos } from '../../hooks/usePreparacionHistoricos'
import { PreparandoHistoricos } from '../../components/PreparandoHistoricos'
import { useLiveDayPnl } from '../../hooks/useLiveDayPnl'
import { dailyPnlQuery, intradayPnlQuery } from '../../queries/currencyQueries'
import { METRIC_LABELS, localToday, metricFor } from '../../utils/pnlChart'
import { fromDaily, fromIntraday } from '../../utils/evolutionSeries'
import { applyLiveToday, periodSummary } from '../../utils/evolutionSummary'
import { evolutionSubtitle } from '../../utils/panelSubtitles'
import { LineChart } from 'lucide-react'
import { formatPercent } from '../../utils/format'

// Bloque de evolución del Dashboard (#166): pestaña P&L (rentabilidad
// acumulada, por defecto) y pestaña Valor (valor de la cartera). Desde #215
// ambas comparten periodo (24H, 7D…Todo y rango personalizado) y la misma
// consulta, así que cambiar de pestaña es inmediato y conserva el periodo.
// Desde #508 el rango es el selector común de los gráficos, guardado en la
// URL (?evolucion=30d o ?evolucion=2025-01-01_2025-12-31).

type Tab = 'pnl' | 'value'

const PRESETS: readonly RangoPreset[] = ['24h', '7d', '30d', '90d', '6m', '1a', 'anio', 'todo']
const DEFECTO: RangoValor = { tipo: 'preset', preset: 'todo' }

const TABS: { id: Tab; label: string }[] = [
  { id: 'pnl', label: 'P&L' },
  { id: 'value', label: 'Valor' },
]

export function EvolutionCard() {
  const [tab, setTab] = useState<Tab>('pnl')
  const [rango, setRango] = useRangoUrl('evolucion', PRESETS, DEFECTO)
  const panelRef = useRef<HTMLDivElement>(null)
  const [unit, setUnit] = useState<PnlUnit>('pct')
  // Día del mejor o peor resultado cuyo detalle se muestra bajo el resumen (#250).
  const [openDay, setOpenDay] = useState<{ day: string; key: string } | null>(null)
  const today = localToday()
  // Días que se piden: «Todo» desde la primera actividad; los predefinidos, hasta hoy en vivo.
  const resuelto = resolverRango(rango, today)
  const query = resuelto.intradia
    ? { intraday: true as const }
    : { intraday: false as const, from: rango.tipo === 'preset' && rango.preset === 'todo' ? undefined : resuelto.from, to: rango.tipo === 'rango' ? resuelto.to : undefined }

  // Mientras el servidor descarga cierres se reconsulta cada 5 s; después, cada minuto.
  const daily = useCurrencyQuery(
    c => dailyPnlQuery(c, query.intraday ? undefined : query.from, query.intraday ? undefined : query.to),
    { enabled: !query.intraday, refetchInterval: q => (q.state.data?.refreshing ? 5_000 : 60_000) },
  )
  const intraday = useCurrencyQuery(intradayPnlQuery, { enabled: query.intraday, refetchInterval: 60_000 })
  const active = query.intraday ? intraday : daily
  const currency = active.data?.currency ?? active.currency

  const metric = metricFor('Todo')
  // Dependencias primitivas: el rango se lee de la URL en cada render.
  const intradia = serializarRango(rango) === '24h'
  const series = useMemo(
    () => (intradia ? fromIntraday(intraday.data?.points ?? []) : fromDaily(daily.data?.days ?? [], 'Todo')),
    [intradia, intraday.data, daily.data],
  )
  // El día de hoy se mueve con los precios en vivo (#213, #214).
  const liveToday = useLiveDayPnl(query.intraday ? null : daily.data?.today, currency)
  const points = useMemo(() => applyLiveToday(series, liveToday, metric), [series, liveToday, metric])
  const summary = useMemo(() => periodSummary(points, intradia), [points, intradia])
  const valueChange = points.length >= 2 ? points[points.length - 1].value - points[0].value : null
  const labels = METRIC_LABELS[metric]
  // TWR del periodo como dato técnico en la ayuda (#353).
  const twrPct = active.data?.twrPct ?? null
  const approximate = query.intraday ? intraday.data?.approximate ?? [] : []
  const preparacion = usePreparacionHistoricos()
  const periodKey = serializarRango(rango)
  const animationKey = `${periodKey}-${tab}-${unit}`
  // Al cambiar de rango el detalle abierto deja de aplicar.
  const detailDay = openDay?.key === periodKey ? openDay.day : null
  const toggleDay = (day: string) => setOpenDay(o => (o?.day === day && o.key === periodKey ? null : { day, key: periodKey }))

  const state = { loading: active.isLoading, error: active.isError, onRetry: () => void active.refetch(), intraday: query.intraday, currency, points, animationKey }

  return (
    <div ref={panelRef} className={panelSurface('none', 'relative px-5 py-5')} aria-busy={active.isPlaceholderData || undefined}>
      {/* Cambio de periodo (#494): la curva anterior sigue visible y una barra indica la recarga.
          Las reconsultas periódicas de fondo no la encienden. */}
      <RefreshBar active={active.isPlaceholderData} />
      <PanelHeader
        icon={LineChart}
        title="Evolución"
        className="mb-3"
        subtitle={rango.tipo === 'preset' && rango.preset === 'todo' ? evolutionSubtitle('Todo', series[0]?.x ?? null, null)
          : rango.tipo === 'preset' && rango.preset === '24h' ? 'Últimas 24 horas, cada 15 min' : textoRango(rango, today)}
        // Nivel 3 de la norma de selección (#492): opción del panel, sin URL.
        extra={<SegmentedControl label="Curva de evolución" variant="accent" value={tab} onChange={setTab}
          options={TABS.map(t => ({ value: t.id, label: t.label }))} />}
        actions={<RangeSelector value={rango} onChange={setRango} presets={PRESETS} defecto={DEFECTO}
          minDate={daily.data?.from ?? null} label="gráfico de evolución" scopeRef={panelRef} primario />}
      />

      <div>
        {/* Sin todos los cierres no hay curva fiable: progreso en vez de cifras (#334). 24h no depende de ellos. */}
        {!query.intraday && !preparacion.listo ? <PreparandoHistoricos datos={preparacion.datos} /> : <>
        <EvolutionSummary
          summary={summary}
          currency={currency}
          intraday={query.intraday}
          mode={tab}
          valueChange={valueChange}
          openDay={detailDay}
          onOpenDay={toggleDay}
          metricLabel={labels.short}
          metricHelp={
            <>
              <p>{labels.help}</p>
              {twrPct !== null && (
                <p>Rentabilidad ponderada en el tiempo (TWR): <span className="mono">{formatPercent(twrPct)}</span>. Encadena la rentabilidad de cada día sin tener en cuenta cuánto dinero había; con aportaciones a lo largo del tiempo puede diferir mucho del % sobre lo aportado.</p>
              )}
              {query.intraday && <p>Últimas 24 horas, un punto cada 15 minutos y el último con los precios en vivo.</p>}
              <p>Los puntos verdes y rojos sobre la curva son depósitos y retiradas de capital propio, agrupados por semana o mes en periodos largos. Pasa el cursor o usa Tab para ver el importe.</p>
              {approximate.length > 0 && (
                <p>Sin precios de 15 min (valorados con el precio actual): <span className="mono">{approximate.join(', ')}</span></p>
              )}
            </>
          }
          extra={
            <>
              {tab === 'pnl' && (
                <SegmentedControl label="Unidad de la curva" variant="accent" value={unit} onChange={setUnit}
                  options={[{ value: 'pct', label: '%', title: 'Rentabilidad en %' }, { value: 'eur', label: currency === 'USD' ? '$' : '€', title: `P&L en ${currency}` }]} />
              )}
            </>
          }
        />
        {detailDay && (
          <div className="-mt-1 mb-4">
            <CalendarDayDetail date={detailDay} day={daily.data?.days.find(d => d.date === detailDay)} onClose={() => setOpenDay(null)} />
          </div>
        )}
        {tab === 'pnl' ? <PnlChart {...state} unit={unit} /> : <ValueChart {...state} />}
        </>}
      </div>
    </div>
  )
}
