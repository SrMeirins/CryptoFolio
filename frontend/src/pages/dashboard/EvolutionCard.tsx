import { useMemo, useRef, useState } from 'react'
import { LineChart, Maximize2, Undo2, ZoomIn, ZoomOut } from 'lucide-react'
import { EvolutionSummary } from './EvolutionSummary'
import { CalendarDayDetail } from './calendar/CalendarDayDetail'
import { ChartFrame } from './ChartFrame'
import { GraficoEvolucion } from './evolucion/GraficoEvolucion'
import { MetricasEvolucion } from './evolucion/MetricasEvolucion'
import { NavegadorPrecio } from '../portfolio/detalle/NavegadorPrecio'
import { RangeSelector } from '../../components/RangeSelector'
import { Hint, iconButtonClasses, SegmentedControl, PanelHeader, panelSurface, RefreshBar } from '../../components/ui'
import { useRangoUrl } from '../../hooks/useRangoUrl'
import { useCurrencyQuery } from '../../hooks/useCurrencyQuery'
import { useChartColors } from '../../hooks/useChartColors'
import { useChartZoom } from '../../hooks/useChartZoom'
import { usePreparacionHistoricos } from '../../hooks/usePreparacionHistoricos'
import { PreparandoHistoricos } from '../../components/PreparandoHistoricos'
import { useLiveDayPnl } from '../../hooks/useLiveDayPnl'
import { dailyPnlQuery, intradayPnlQuery } from '../../queries/currencyQueries'
import { METRIC_LABELS, localToday, metricFor } from '../../utils/pnlChart'
import { fromDaily, fromIntraday } from '../../utils/evolutionSeries'
import { applyLiveToday, periodSummary } from '../../utils/evolutionSummary'
import { metricasVentana, rebasarVentana } from '../../utils/evolucionVentana'
import { esCompleta, rangoAVentana, ventanaARango, type Ventana } from '../../utils/chartZoom'
import { samplePoints } from '../../utils/assetPriceChart'
import { serializarRango, textoRango, type RangoPreset, type RangoValor } from '../../utils/rangoGrafico'
import { evolutionSubtitle } from '../../utils/panelSubtitles'
import { formatPercent } from '../../utils/format'

// Bloque de evolución del Dashboard (#166): pestaña P&L (rentabilidad
// acumulada, por defecto) y pestaña Valor (valor de la cartera). Ambas
// comparten rango (selector común #508, en la URL) y ventana de zoom (#509).
// Se carga toda la historia una vez (la misma consulta que las tarjetas KPI)
// y el rango o el zoom eligen qué tramo se ve; el P&L y el % del tramo se
// recalculan en el cliente con las reglas del servidor, así que acercar o
// desplazar es inmediato. En 24 h, la serie intradía con su zoom local.

type Tab = 'pnl' | 'value'
type PnlUnit = 'pct' | 'eur'

const PRESETS: readonly RangoPreset[] = ['24h', '7d', '30d', '90d', '6m', '1a', 'anio', 'todo']
const DEFECTO: RangoValor = { tipo: 'preset', preset: 'todo' }
const MARGEN_DERECHO = 76
const NO_DAYS: ReadonlySet<string> = new Set()

const TABS: { id: Tab; label: string }[] = [
  { id: 'pnl', label: 'P&L' },
  { id: 'value', label: 'Valor' },
]

export function EvolutionCard() {
  const c = useChartColors()
  const [tab, setTab] = useState<Tab>('pnl')
  const [rango, setRango] = useRangoUrl('evolucion', PRESETS, DEFECTO)
  const panelRef = useRef<HTMLDivElement>(null)
  const [unit, setUnit] = useState<PnlUnit>('pct')
  const [conAportado, setConAportado] = useState(true)
  // Día del mejor o peor resultado cuyo detalle se muestra bajo el resumen (#250).
  const [openDay, setOpenDay] = useState<{ day: string; key: string } | null>(null)
  const today = localToday()
  const intradia = serializarRango(rango) === '24h'

  // Toda la historia diaria (misma caché que las tarjetas); mientras el servidor
  // descarga cierres se reconsulta cada 5 s y después cada minuto.
  const daily = useCurrencyQuery(c2 => dailyPnlQuery(c2), {
    enabled: !intradia, refetchInterval: q => (q.state.data?.refreshing ? 5_000 : 60_000),
  })
  const intraday = useCurrencyQuery(intradayPnlQuery, { enabled: intradia, refetchInterval: 60_000 })
  const active = intradia ? intraday : daily
  const currency = active.data?.currency ?? active.currency

  const metric = metricFor('Todo')
  const series = useMemo(
    () => (intradia ? fromIntraday(intraday.data?.points ?? []) : fromDaily(daily.data?.days ?? [], 'Todo')),
    [intradia, intraday.data, daily.data],
  )
  // El día de hoy se mueve con los precios en vivo (#213, #214).
  const liveToday = useLiveDayPnl(intradia ? null : daily.data?.today, currency)
  const full = useMemo(() => applyLiveToday(series, liveToday, metric), [series, liveToday, metric])
  const extentFrom = full[0]?.x ?? 0
  const extentTo = full[full.length - 1]?.x ?? 0
  const extent = useMemo(() => (full.length > 1 ? { from: extentFrom, to: extentTo } : null), [full.length, extentFrom, extentTo])

  // Ventana visible: en días, la del rango de la URL (el zoom la cambia por un
  // rango personalizado); en 24 h, un zoom local que no va a la URL.
  const [ventanaIntradia, setVentanaIntradia] = useState<Ventana | null>(null)
  const anchoEje = tab === 'pnl' && unit === 'pct' ? 56 : 80
  const zoom = useChartZoom(extent, { left: anchoEje, right: MARGEN_DERECHO }, intradia
    ? { ventana: ventanaIntradia, set: setVentanaIntradia }
    : { ventana: rangoAVentana(rango, today), set: w => { if (extent) setRango(ventanaARango(w, extent)) } })
  const { v, containerRef, handlers, tramo, arrastrando } = zoom
  const vf = v?.from ?? 0
  const vt = v?.to ?? 0
  const visibles = useMemo(() => (vt > vf ? rebasarVentana(full, vf, vt) : []), [full, vf, vt])
  const summary = useMemo(() => periodSummary(visibles, intradia), [visibles, intradia])
  const metricas = useMemo(() => metricasVentana(visibles), [visibles])
  const overview = useMemo(
    () => samplePoints(full.map(p => ({ t: p.x, price: p.value })), NO_DAYS, 240),
    [full],
  )

  const labels = METRIC_LABELS[metric]
  // TWR del periodo como dato técnico en la ayuda (#353).
  const twrPct = active.data?.twrPct ?? null
  const approximate = intradia ? intraday.data?.approximate ?? [] : []
  const preparacion = usePreparacionHistoricos()
  const periodKey = serializarRango(rango)
  const animationKey = `${intradia}-${tab}-${unit}`
  // Al cambiar de rango el detalle abierto deja de aplicar.
  const detailDay = openDay?.key === periodKey ? openDay.day : null
  const toggleDay = (day: string) => setOpenDay(o => (o?.day === day && o.key === periodKey ? null : { day, key: periodKey }))
  const completo = !v || !extent || esCompleta(v, extent)
  const subtitulo = rango.tipo === 'preset' && rango.preset === 'todo' ? evolutionSubtitle('Todo', full[0]?.x ?? null, null)
    : intradia ? 'Últimas 24 horas, cada 15 min' : textoRango(rango, today)
  const modo = tab === 'value' ? 'value' : unit === 'pct' ? 'pct' : 'pnl'

  return (
    <div ref={panelRef} className={panelSurface('none', 'relative px-5 py-5')} aria-busy={active.isPlaceholderData || undefined}>
      <RefreshBar active={active.isPlaceholderData} />
      <PanelHeader
        icon={LineChart}
        title="Evolución"
        className="mb-3"
        subtitle={subtitulo}
        // Nivel 3 de la norma de selección (#492): opción del panel, sin URL.
        extra={<SegmentedControl label="Curva de evolución" variant="accent" value={tab} onChange={setTab}
          options={TABS.map(t => ({ value: t.id, label: t.label }))} />}
        actions={<RangeSelector value={rango} onChange={setRango} presets={PRESETS} defecto={DEFECTO}
          minDate={daily.data?.from ?? null} label="gráfico de evolución" scopeRef={panelRef} primario />}
      />

      <div>
        {/* Sin todos los cierres no hay curva fiable: progreso en vez de cifras (#334). 24h no depende de ellos. */}
        {!intradia && !preparacion.listo ? <PreparandoHistoricos datos={preparacion.datos} /> : <>
        <EvolutionSummary
          summary={summary}
          currency={currency}
          intraday={intradia}
          mode={tab}
          valueChange={metricas?.variacionValor ?? null}
          metricLabel={labels.short}
          metricHelp={
            <>
              <p>{labels.help}</p>
              {twrPct !== null && (
                <p>Rentabilidad ponderada en el tiempo (TWR) de toda la historia: <span className="mono">{formatPercent(twrPct)}</span>. Encadena la rentabilidad de cada día sin tener en cuenta cuánto dinero había; con aportaciones a lo largo del tiempo puede diferir mucho del % sobre lo aportado.</p>
              )}
              {intradia && <p>Últimas 24 horas, un punto cada 15 minutos y el último con los precios en vivo.</p>}
              <p>Los puntos verdes y rojos sobre la curva son depósitos y retiradas de capital propio, agrupados por semana o mes en periodos largos. Pasa el cursor o usa Tab para ver el importe.</p>
              <p>Las franjas grises son periodos sin posiciones: no cuentan en las métricas.</p>
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
              {tab === 'value' && (
                <button type="button" aria-pressed={conAportado} onClick={() => setConAportado(a => !a)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-xs text-fg-muted hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
                  <span className="w-4 border-t-2 border-dashed border-fg-subtle" aria-hidden="true" />
                  {conAportado ? 'Ocultar aportado' : 'Mostrar aportado'}
                </button>
              )}
            </>
          }
        />
        <MetricasEvolucion metricas={metricas} summary={summary} modo={tab} intraday={intradia} currency={currency} onOpenDay={toggleDay} />
        {detailDay && (
          <div className="mt-3">
            <CalendarDayDetail date={detailDay} day={daily.data?.days.find(d => d.date === detailDay)} onClose={() => setOpenDay(null)} />
          </div>
        )}

        {/* Zoom (#509): rueda, arrastre, Mayús y arrastrar para elegir un tramo, historial y teclado. */}
        <div className="mt-4 mb-1.5 flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[11px] text-fg-subtle">Rueda para acercar, arrastra para moverte y Mayús y arrastrar para elegir un tramo.</p>
          <div className="flex items-center gap-1" role="group" aria-label="Zoom del gráfico de evolución">
            <Hint label="Deshacer el último zoom (Retroceso)">
              <button type="button" onClick={zoom.atras} disabled={!zoom.puedeAtras} aria-keyshortcuts="Backspace"
                className={`${iconButtonClasses('sm')} gap-1 px-2 w-auto text-[11px]`} aria-label="Atrás: deshacer el último zoom">
                <Undo2 size={13} aria-hidden="true" /> Atrás
              </button>
            </Hint>
            <Hint label="Ver todo el rango (Escape)">
              <button type="button" onClick={zoom.reset} disabled={completo} aria-keyshortcuts="Escape"
                className={`${iconButtonClasses('sm')} gap-1 px-2 w-auto text-[11px]`} aria-label="Todo: ver todo el rango">
                <Maximize2 size={13} aria-hidden="true" /> Todo
              </button>
            </Hint>
            <Hint label="Alejar (-)">
              <button type="button" onClick={zoom.alejar} disabled={completo} className={iconButtonClasses('sm')} aria-label="Alejar el gráfico">
                <ZoomOut size={14} aria-hidden="true" />
              </button>
            </Hint>
            <Hint label="Acercar (+)">
              <button type="button" onClick={zoom.acercar} disabled={!v} className={iconButtonClasses('sm')} aria-label="Acercar el gráfico">
                <ZoomIn size={14} aria-hidden="true" />
              </button>
            </Hint>
          </div>
        </div>
        <ChartFrame loading={active.isLoading} error={active.isError} onRetry={() => void active.refetch()} empty={visibles.length === 0}
          errorText={tab === 'pnl' ? 'No se pudo cargar la rentabilidad.' : 'No se pudo cargar el valor de la cartera.'}>
          <div ref={containerRef} {...handlers} tabIndex={0} role="img" data-testid="grafico-evolucion"
            aria-label={`Evolución ${tab === 'pnl' ? 'del P&L' : 'del valor'}: ${subtitulo}. Usa más y menos para acercar o alejar, las flechas para desplazarte, Retroceso para deshacer y Escape para ver todo.`}
            aria-keyshortcuts="+ - ArrowLeft ArrowRight Backspace Escape"
            className={`relative h-full rounded-lg select-none touch-none outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${arrastrando ? 'cursor-grabbing' : 'cursor-crosshair'}`}>
            <GraficoEvolucion puntos={visibles} modo={modo} currency={currency} intraday={intradia}
              animationKey={animationKey} conAportado={conAportado} />
            {tramo && (
              <span aria-hidden="true" data-testid="tramo-zoom" className="absolute inset-y-0 bg-brand/15 border-x-2 border-brand/60 pointer-events-none"
                style={{ left: tramo.left, width: tramo.width }} />
            )}
          </div>
        </ChartFrame>
        {extent && v && overview.length > 1 && (
          <div className="mt-2" style={{ marginLeft: anchoEje, marginRight: MARGEN_DERECHO }}>
            <NavegadorPrecio points={overview} extent={extent} v={v} onChange={zoom.setVentana} color={c.axis} />
          </div>
        )}
        </>}
      </div>
    </div>
  )
}
