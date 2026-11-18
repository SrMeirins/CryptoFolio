import { useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { useCurrencyQuery } from '../../hooks/useCurrencyQuery'
import { usePreparacionHistoricos } from '../../hooks/usePreparacionHistoricos'
import { PreparandoHistoricos } from '../../components/PreparandoHistoricos'
import { useLiveDayPnl } from '../../hooks/useLiveDayPnl'
import { dailyPnlQuery } from '../../queries/currencyQueries'
import { localToday } from '../../utils/pnlChart'
import { addMonths, compareYm, monthGrid, monthLabel, monthRange, ymOf, type YearMonth } from '../../utils/pnlCalendar'
import { weekTotals, yearMonths } from '../../utils/calendarStats'
import { Button, SegmentedControl, iconButtonClasses, PanelHeader, Skeleton, MonthPicker, panelSurface, SkeletonGroup, QueryError } from '../../components/ui'
import { CalendarMonthGrid } from './calendar/CalendarMonthGrid'
import { CalendarLegend } from './calendar/CalendarLegend'
import { CalendarDayDetail } from './calendar/CalendarDayDetail'
import { CalendarYearView } from './calendar/CalendarYearView'
import { ResumenPeriodo } from './pnlDiario/ResumenPeriodo'
import { RangeSelector } from '../../components/RangeSelector'
import { useRangoUrl } from '../../hooks/useRangoUrl'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { textoRango, type RangoPreset, type RangoValor } from '../../utils/rangoGrafico'
import { calendarSubtitle } from '../../utils/panelSubtitles'
import { timezoneLabel } from '../../utils/timezoneLabel'
import { failure } from '../../utils/queryFailure'

// Calendario de ganancias y pérdidas diarias (#167), sobre GET /api/v1/pnl/daily.
// El día de hoy se recalcula con cada precio en vivo (#213). Desde #216: vista
// anual, estadísticas del mes, totales por semana, escala de color continua,
// detalle de cada día, botón «Hoy» y selector de mes y año. Desde #511, arriba
// el resumen del periodo del selector de rango común (cabecera, tira y barras
// con el acumulado); el calendario mantiene su navegación por mes debajo.

type View = 'month' | 'year'

const navButton = iconButtonClasses('sm', false, 'disabled:hover:bg-transparent')
const PRESETS: readonly RangoPreset[] = ['7d', '30d', '90d', '6m', '1a', 'anio', 'todo']
const DEFECTO: RangoValor = { tipo: 'preset', preset: '30d' }

export function PnlCalendar() {
  const today = localToday()
  const current = ymOf(today)
  const [view, setView] = useState<View>('month')
  const [ym, setYm] = useState<YearMonth>(current)
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [rango, setRango] = useRangoUrl('pnl-diario', PRESETS, DEFECTO)
  const panelRef = useRef<HTMLDivElement>(null)
  const calendarioRef = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()
  const range = monthRange(ym, today)

  // Primer mes con actividad: se toma de la consulta de "Todo" que ya hace el gráfico (misma caché).
  const allQ = useCurrencyQuery(currency => dailyPnlQuery(currency))
  const { data: all } = allQ
  const firstYm = all ? ymOf(all.from) : null

  // Mes en la moneda de visualización; la otra se precarga para que el toggle sea instantáneo (#177).
  const monthQ = useCurrencyQuery(
    currency => dailyPnlQuery(currency, range?.from, range?.to),
    {
      enabled: range !== null && view === 'month',
      refetchInterval: (query) => (query.state.data?.refreshing ? 5_000 : compareYm(ym, current) === 0 ? 60_000 : false),
    },
  )
  const { data: monthData, isLoading, isError, currency: requested } = monthQ
  // Año completo para la vista anual (hasta hoy).
  const yearTo = `${ym.year}-12-31` < today ? `${ym.year}-12-31` : today
  const yearQ = useCurrencyQuery(
    currency => dailyPnlQuery(currency, `${ym.year}-01-01`, yearTo),
    { enabled: view === 'year' && `${ym.year}-01-01` <= today },
  )
  const { data: yearData } = yearQ

  // Un mes futuro (sin rango) compartiría clave con "Todo": se descarta.
  const data = range ? monthData : undefined
  const currency = (view === 'year' ? yearData?.currency : data?.currency) ?? requested

  // Sin todos los cierres, ni calendario ni mejor/peor día: progreso (#334).
  const preparacion = usePreparacionHistoricos()

  // Hoy con los precios en vivo (#213): sustituye al valor de la última consulta.
  const live = useLiveDayPnl(data?.today, currency)
  const days = useMemo(() => (data?.days ?? []).map(d =>
    d.live && live && data?.today?.date === d.date ? { ...d, pnl: Math.round(live.pnl * 100) / 100, pct: live.pct } : d,
  ), [data, live])
  const byDate = useMemo(() => new Map(days.map(d => [d.date, d])), [days])
  const complete = useMemo(() => days.filter(d => d.complete), [days])
  const weeks = monthGrid(ym)
  const totals = useMemo(() => weekTotals(weeks, byDate), [weeks, byDate])
  const maxAbs = complete.reduce((m, d) => Math.max(m, Math.abs(d.pnl)), 0)
  const months = useMemo(() => yearMonths(yearData?.days ?? [], ym.year), [yearData, ym.year])

  const minYm = firstYm ?? current
  const canPrev = view === 'month' ? compareYm(ym, minYm) > 0 : ym.year > minYm.year
  const canNext = view === 'month' ? compareYm(ym, current) < 0 : ym.year < current.year

  function go(next: YearMonth) {
    const clamped = compareYm(next, current) > 0 ? current : compareYm(next, minYm) < 0 ? minYm : next
    setYm(clamped)
    setSelected(null)
  }
  // Desde el resumen del periodo (#511): abrir un día o un mes en el calendario.
  const verCalendario = () => calendarioRef.current?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' })
  function abrirDia(date: string) {
    setView('month')
    go(ymOf(date))
    setSelected(date)
    verCalendario()
  }
  function abrirMes(date: string) {
    setView('month')
    go(ymOf(date))
    verCalendario()
  }
  const step = (delta: number) => go(view === 'month' ? addMonths(ym, delta) : { year: ym.year + delta, month: ym.month })

  // Fallo del mes, del año o de la serie completa (#498).
  const fallo = failure(monthQ, allQ, yearQ)
  return (
    <div ref={panelRef} className={panelSurface('none', 'px-5 py-5')}>
      <PanelHeader
        icon={CalendarDays}
        title="P&L diario"
        className="mb-4"
        subtitle={`${textoRango(rango, today)}, día natural, ${timezoneLabel()}`}
        help={<>
          <p>Ganancia o pérdida de cada día natural, de 00:00 a 24:00 ({timezoneLabel()}), sin contar depósitos ni retiradas.</p>
          <p>Arriba, el periodo elegido: el acumulado (con hoy en vivo) y su % sobre el capital aportado, como en Evolución; los recuentos, el mejor y el peor día, las rachas y las medias solo cuentan días cerrados.</p>
          <p><span className="text-brand">● hoy</span> se actualiza en vivo desde las 00:00. El chip «24h» de la tarjeta Valor mide en cambio las últimas 24 horas móviles, por eso las cifras no coinciden.</p>
          <p>Pulsa una barra o un día para verlo en el calendario. Con el teclado, las flechas recorren los días.</p>
        </>}
        actions={<RangeSelector value={rango} onChange={setRango} presets={PRESETS} defecto={DEFECTO}
          minDate={all?.from ?? null} label="P&L diario" scopeRef={panelRef} />}
      />

      {!preparacion.listo ? <PreparandoHistoricos datos={preparacion.datos} /> : <>
        <ResumenPeriodo rango={rango} today={today} onHover={setHovered} onOpenDay={abrirDia} onOpenMonth={abrirMes} />

        <section ref={calendarioRef} aria-labelledby="pnl-calendario-titulo" className="mt-5 pt-4 border-t border-border scroll-mt-4">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div className="min-w-0">
              <h3 id="pnl-calendario-titulo" className="text-xs font-semibold uppercase tracking-widest text-fg-muted">Calendario</h3>
              <p className="text-[11px] text-fg-subtle">{calendarSubtitle(view, monthLabel(ym), ym.year)}</p>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <SegmentedControl label="Vista del calendario" variant="accent" value={view} onChange={v => { setView(v); setSelected(null) }}
                options={[{ value: 'month', label: 'Mes' }, { value: 'year', label: 'Año' }]} />
              <button type="button" onClick={() => step(-1)} disabled={!canPrev} aria-label={view === 'month' ? 'Mes anterior' : 'Año anterior'} className={navButton}>
                <ChevronLeft size={16} />
              </button>
              <MonthPicker mode={view} value={ym} min={minYm} max={current}
                label={view === 'month' ? 'Elegir mes' : 'Elegir año'}
                onChange={next => go(next)} />
              <button type="button" onClick={() => step(1)} disabled={!canNext} aria-label={view === 'month' ? 'Mes siguiente' : 'Año siguiente'} className={navButton}>
                <ChevronRight size={16} />
              </button>
              <Button size="sm" variant="ghost" disabled={view === 'month' && compareYm(ym, current) === 0 && selected === today}
                onClick={() => { setView('month'); go(current); setSelected(today) }}>
                Hoy
              </Button>
            </div>
          </div>
          {view === 'year' ? (
            <CalendarYearView year={ym.year} months={months} current={current} currency={currency}
              onOpen={next => { setView('month'); go(next) }} />
          ) : (
            <>
              {fallo && <QueryError what="el P&L del mes" error={fallo.error} onRetry={fallo.retry} />}
              {isLoading && (
                <SkeletonGroup label="Cargando el calendario" className="grid grid-cols-7 gap-1.5">
                  {Array.from({ length: 35 }, (_, i) => <Skeleton key={i} className="h-16" />)}
                </SkeletonGroup>
              )}
              {!isError && (
                <div key={`${ym.year}-${ym.month}`} className="animate-page-in">
                  <CalendarMonthGrid weeks={weeks} byDate={byDate} totals={totals} today={today} maxAbs={maxAbs} currency={currency}
                    selected={selected} onSelect={d => setSelected(s => (s === d ? null : d))} caption={`P&L diario de ${monthLabel(ym)}`}
                    hovered={hovered} onHover={setHovered} />
                </div>
              )}
              <CalendarLegend maxAbs={maxAbs} currency={currency} />
              {selected && byDate.get(selected) && (
                <CalendarDayDetail date={selected} day={byDate.get(selected)} onClose={() => setSelected(null)} />
              )}
            </>
          )}
        </section>
      </>}
    </div>
  )
}
