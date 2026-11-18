import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { useCurrencyQuery } from '../../hooks/useCurrencyQuery'
import { usePreparacionHistoricos } from '../../hooks/usePreparacionHistoricos'
import { PreparandoHistoricos } from '../../components/PreparandoHistoricos'
import { useLiveDayPnl } from '../../hooks/useLiveDayPnl'
import { dailyPnlQuery } from '../../queries/currencyQueries'
import { localToday } from '../../utils/pnlChart'
import { addMonths, compareYm, monthGrid, monthLabel, monthRange, ymOf, type YearMonth } from '../../utils/pnlCalendar'
import { weekTotals } from '../../utils/calendarStats'
import { totalesAnio, totalTramo, type DiaValorado } from '../../utils/calendarioDietz'
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
import { signedMoney, signedPct } from './calendar/format'

// Calendario de ganancias y pérdidas diarias (#167), sobre GET /api/v1/pnl/daily.
// El día de hoy se recalcula con cada precio en vivo (#213). Desde #216: vista
// anual, estadísticas del mes, totales por semana, escala de color continua,
// detalle de cada día, botón «Hoy» y selector de mes y año. Desde #511, arriba
// el resumen del periodo del selector de rango común (cabecera, tira y barras
// con el acumulado); el calendario mantiene su navegación por mes debajo.
// Desde #512: teselas opacas, % del mes y del año por Dietz modificado (el del
// mes, el de la API; el del año y los meses de la vista Año, calculados en el
// cliente con la misma fórmula sobre la historia completa con hoy en vivo),
// detalle con día anterior y siguiente, y teclado del calendario: Re Pág y
// Av Pág cambian de mes (o de año), T vuelve a hoy y las flechas cruzan de mes.

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
  // Día al que llevar el foco tras cruzar de mes con las flechas.
  const [focusDate, setFocusDate] = useState<string | null>(null)
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

  // Un mes futuro (sin rango) compartiría clave con "Todo": se descarta.
  const data = range ? monthData : undefined
  const currency = (view === 'year' ? all?.currency : data?.currency) ?? requested

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
  // Toda la historia con hoy en vivo (valor y P&L), para la vista Año y su Dietz.
  const liveAll = useLiveDayPnl(all?.today, all?.currency ?? currency)
  const historia: DiaValorado[] = useMemo(() => (all?.days ?? []).map(d =>
    d.live && liveAll && all?.today?.date === d.date ? { ...d, pnl: Math.round(liveAll.pnl * 100) / 100, pct: liveAll.pct, value: liveAll.value } : d,
  ), [all, liveAll])
  const months = useMemo(() => totalesAnio(historia, ym.year), [historia, ym.year])
  const totalAnio = useMemo(() => totalTramo(historia, `${ym.year}-01-01`, `${ym.year}-12-31`), [historia, ym.year])
  // Total del mes visible: el P&L de sus días (hoy en vivo) y el % Dietz de la API.
  const totalMesVisible = complete.length ? { pnl: Math.round(complete.reduce((s, d) => s + d.pnl, 0) * 100) / 100, pct: data?.dietzPct ?? null } : null
  // Días con dato vecinos del elegido (en toda la historia), para el detalle.
  const conDato = useMemo(() => historia.filter(d => d.complete || d.live).map(d => d.date), [historia])
  const iSel = selected ? conDato.indexOf(selected) : -1
  const prevDia = iSel > 0 ? conDato[iSel - 1] : null
  const nextDia = iSel >= 0 && iSel < conDato.length - 1 ? conDato[iSel + 1] : null

  const minYm = firstYm ?? current
  const canPrev = view === 'month' ? compareYm(ym, minYm) > 0 : ym.year > minYm.year
  const canNext = view === 'month' ? compareYm(ym, current) < 0 : ym.year < current.year

  function go(next: YearMonth) {
    const clamped = compareYm(next, current) > 0 ? current : compareYm(next, minYm) < 0 ? minYm : next
    setYm(clamped)
    setSelected(null)
    setFocusDate(null)
  }
  function elegirDia(date: string) {
    if (compareYm(ymOf(date), ym) !== 0) go(ymOf(date))
    setSelected(date)
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
  const irAHoy = () => { setView('month'); go(current); setSelected(today) }

  // Teclado del calendario (#512). Con el foco dentro, estas teclas son suyas y
  // no llegan al selector de rango del panel, que usa las mismas.
  function teclasCalendario(e: KeyboardEvent<HTMLElement>) {
    const t = e.target as HTMLElement
    if (e.altKey || e.ctrlKey || e.metaKey || t.closest('input, textarea, select, [role="dialog"], [role="listbox"]')) return
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      const delta = e.key === 'PageUp' ? -1 : 1
      if (delta < 0 ? !canPrev : !canNext) return
      e.preventDefault()
      e.stopPropagation()
      step(delta)
      // En la vista Mes la cuadrícula se vuelve a montar: el foco pasa al mismo día del mes nuevo (o al último).
      if (view === 'month') {
        const destino = addMonths(ym, delta)
        const dia = Math.min(Number(selected?.slice(8) ?? (t.getAttribute('aria-label') ?? '').match(/, (\d+) de /)?.[1] ?? 1), new Date(Date.UTC(destino.year, destino.month, 0)).getUTCDate())
        const fecha = `${destino.year}-${String(destino.month).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
        setFocusDate(fecha <= today ? fecha : today)
      }
    } else if (e.key === 't' || e.key === 'T') {
      e.preventDefault()
      e.stopPropagation()
      irAHoy()
      setFocusDate(today)
    }
  }

  // Fallo del mes, del año o de la serie completa (#498).
  const fallo = failure(monthQ, allQ)
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
          <p>Pulsa una barra o un día para verlo en el calendario. El % de cada mes y del año es el de Dietz modificado: pondera los depósitos y las retiradas por el tiempo que estuvieron invertidos.</p>
          <p>Con el foco en el calendario: las flechas recorren los días (y cruzan de mes), Re Pág y Av Pág cambian de mes y T vuelve a hoy.</p>
        </>}
        actions={<RangeSelector value={rango} onChange={setRango} presets={PRESETS} defecto={DEFECTO}
          minDate={all?.from ?? null} label="P&L diario" scopeRef={panelRef} />}
      />

      {!preparacion.listo ? <PreparandoHistoricos datos={preparacion.datos} /> : <>
        <ResumenPeriodo rango={rango} today={today} onHover={setHovered} onOpenDay={abrirDia} onOpenMonth={abrirMes} />

        <section ref={calendarioRef} aria-labelledby="pnl-calendario-titulo" onKeyDown={teclasCalendario}
          className="mt-5 pt-4 border-t border-border scroll-mt-4">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div className="min-w-0">
              <h3 id="pnl-calendario-titulo" className="text-xs font-semibold uppercase tracking-widest text-fg-muted">Calendario</h3>
              <p className="text-[11px] text-fg-subtle">{calendarSubtitle(view, monthLabel(ym), ym.year)}</p>
              {view === 'month' && totalMesVisible && (
                <p className="mt-0.5 text-xs" data-testid="total-mes">
                  <span className="text-fg-subtle">Total del mes </span>
                  <span className={`mono font-semibold tabular-nums ${totalMesVisible.pnl > 0 ? 'text-positive-ink' : totalMesVisible.pnl < 0 ? 'text-negative-ink' : 'text-fg-muted'}`}>{signedMoney(totalMesVisible.pnl, currency)}</span>
                  {totalMesVisible.pct !== null && <span className={`ml-1.5 mono tabular-nums ${totalMesVisible.pct > 0 ? 'text-positive-ink' : totalMesVisible.pct < 0 ? 'text-negative-ink' : 'text-fg-muted'}`}>{signedPct(totalMesVisible.pct)}</span>}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 flex-wrap" aria-keyshortcuts="PageUp PageDown T">
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
                onClick={irAHoy}>
                Hoy
              </Button>
            </div>
          </div>
          {view === 'year' ? (
            <CalendarYearView year={ym.year} months={months} total={totalAnio} current={current} currency={currency}
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
                    hovered={hovered} onHover={setHovered} focusDate={focusDate}
                    onNavigate={d => { go(ymOf(d)); setFocusDate(d) }} />
                </div>
              )}
              <CalendarLegend maxAbs={maxAbs} currency={currency} marcador={hovered ? byDate.get(hovered)?.pnl ?? null : null} />
              {selected && byDate.get(selected) && (
                <CalendarDayDetail date={selected} day={byDate.get(selected)} dias={days} onClose={() => setSelected(null)}
                  onPrev={prevDia ? () => elegirDia(prevDia) : null} onNext={nextDia ? () => elegirDia(nextDia) : null} />
              )}
            </>
          )}
        </section>
      </>}
    </div>
  )
}
