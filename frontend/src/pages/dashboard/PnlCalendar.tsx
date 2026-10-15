import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { useCurrencyQuery } from '../../hooks/useCurrencyQuery'
import { useLiveDayPnl } from '../../hooks/useLiveDayPnl'
import { dailyPnlQuery } from '../../queries/currencyQueries'
import { madridToday } from '../../utils/pnlChart'
import { addMonths, compareYm, monthGrid, monthLabel, monthRange, monthSummary, ymOf, type YearMonth } from '../../utils/pnlCalendar'
import { monthStats, weekTotals, yearMonths } from '../../utils/calendarStats'
import { Button, SegmentedControl, Select, cardClasses, iconButtonClasses, PanelHeader, Skeleton } from '../../components/ui'
import { CalendarMonthGrid } from './calendar/CalendarMonthGrid'
import { CalendarStats } from './calendar/CalendarStats'
import { CalendarLegend } from './calendar/CalendarLegend'
import { CalendarDayDetail } from './calendar/CalendarDayDetail'
import { CalendarYearView } from './calendar/CalendarYearView'
import { calendarSubtitle } from '../../utils/panelSubtitles'

// Calendario de ganancias y pérdidas diarias (#167), sobre GET /api/v1/pnl/daily.
// El día de hoy se recalcula con cada precio en vivo (#213). Desde #216: vista
// anual, estadísticas del mes, totales por semana, escala de color continua,
// detalle de cada día, botón «Hoy» y selector de mes y año.

type View = 'month' | 'year'

const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const navButton = iconButtonClasses('sm', false, 'disabled:hover:bg-transparent')

export function PnlCalendar() {
  const today = madridToday()
  const current = ymOf(today)
  const [view, setView] = useState<View>('month')
  const [ym, setYm] = useState<YearMonth>(current)
  const [selected, setSelected] = useState<string | null>(null)
  const range = monthRange(ym, today)

  // Primer mes con actividad: se toma de la consulta de "Todo" que ya hace el gráfico (misma caché).
  const { data: all } = useCurrencyQuery(currency => dailyPnlQuery(currency))
  const firstYm = all ? ymOf(all.from) : null

  // Mes en la moneda de visualización; la otra se precarga para que el toggle sea instantáneo (#177).
  const { data: monthData, isLoading, isError, currency: requested } = useCurrencyQuery(
    currency => dailyPnlQuery(currency, range?.from, range?.to),
    {
      enabled: range !== null && view === 'month',
      refetchInterval: (query) => (query.state.data?.refreshing ? 5_000 : compareYm(ym, current) === 0 ? 60_000 : false),
    },
  )
  // Año completo para la vista anual (hasta hoy).
  const yearTo = `${ym.year}-12-31` < today ? `${ym.year}-12-31` : today
  const { data: yearData } = useCurrencyQuery(
    currency => dailyPnlQuery(currency, `${ym.year}-01-01`, yearTo),
    { enabled: view === 'year' && `${ym.year}-01-01` <= today },
  )

  // Un mes futuro (sin rango) compartiría clave con "Todo": se descarta.
  const data = range ? monthData : undefined
  const currency = (view === 'year' ? yearData?.currency : data?.currency) ?? requested

  // Hoy con los precios en vivo (#213): sustituye al valor de la última consulta.
  const live = useLiveDayPnl(data?.today, currency)
  const days = useMemo(() => (data?.days ?? []).map(d =>
    d.live && live && data?.today?.date === d.date ? { ...d, pnl: Math.round(live.pnl * 100) / 100, pct: live.pct } : d,
  ), [data, live])
  const byDate = useMemo(() => new Map(days.map(d => [d.date, d])), [days])
  const complete = useMemo(() => days.filter(d => d.complete), [days])
  const weeks = monthGrid(ym)
  const stats = useMemo(() => monthStats(days), [days])
  const totals = useMemo(() => weekTotals(weeks, byDate), [weeks, byDate])
  const maxAbs = complete.reduce((m, d) => Math.max(m, Math.abs(d.pnl)), 0)
  const months = useMemo(() => yearMonths(yearData?.days ?? [], ym.year), [yearData, ym.year])

  const minYm = firstYm ?? current
  const canPrev = view === 'month' ? compareYm(ym, minYm) > 0 : ym.year > minYm.year
  const canNext = view === 'month' ? compareYm(ym, current) < 0 : ym.year < current.year
  const years = Array.from({ length: current.year - minYm.year + 1 }, (_, i) => minYm.year + i)

  function go(next: YearMonth) {
    const clamped = compareYm(next, current) > 0 ? current : compareYm(next, minYm) < 0 ? minYm : next
    setYm(clamped)
    setSelected(null)
  }
  const step = (delta: number) => go(view === 'month' ? addMonths(ym, delta) : { year: ym.year + delta, month: ym.month })

  return (
    <div className={cardClasses('none', 'px-5 py-5')}>
      <PanelHeader
        icon={CalendarDays}
        title="P&L diario"
        className="mb-3"
        subtitle={calendarSubtitle(view, monthLabel(ym), ym.year)}
        help={<>
          <p>Ganancia o pérdida de cada día natural, de 00:00 a 24:00 (hora de Madrid), sin contar depósitos ni retiradas.</p>
          <p><span className="text-brand">● hoy</span> se actualiza en vivo desde las 00:00. El chip «24h» de la tarjeta Valor mide en cambio las últimas 24 horas móviles, por eso las cifras no coinciden.</p>
          <p>Pulsa un día para ver su detalle. Con el teclado, las flechas recorren los días.</p>
        </>}
        extra={<SegmentedControl label="Vista del calendario" value={view} onChange={v => { setView(v); setSelected(null) }}
          options={[{ value: 'month', label: 'Mes' }, { value: 'year', label: 'Año' }]} />}
        actions={<>
          <button type="button" onClick={() => step(-1)} disabled={!canPrev} aria-label={view === 'month' ? 'Mes anterior' : 'Año anterior'} className={navButton}>
            <ChevronLeft size={16} />
          </button>
          {view === 'month' && (
            <Select size="sm" aria-label="Mes" value={ym.month} className="w-auto"
              onChange={e => go({ year: ym.year, month: Number(e.target.value) })}>
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1} disabled={compareYm({ year: ym.year, month: i + 1 }, current) > 0 || compareYm({ year: ym.year, month: i + 1 }, minYm) < 0}>
                  {name}
                </option>
              ))}
            </Select>
          )}
          <Select size="sm" aria-label="Año" value={ym.year} className="w-auto" onChange={e => go({ year: Number(e.target.value), month: ym.month })}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </Select>
          <button type="button" onClick={() => step(1)} disabled={!canNext} aria-label={view === 'month' ? 'Mes siguiente' : 'Año siguiente'} className={navButton}>
            <ChevronRight size={16} />
          </button>
          <Button size="sm" variant="ghost" disabled={view === 'month' && compareYm(ym, current) === 0 && selected === today}
            onClick={() => { setView('month'); go(current); setSelected(today) }}>
            Hoy
          </Button>
        </>}
      />

      {view === 'year' ? (
        <CalendarYearView year={ym.year} months={months} current={current} currency={currency}
          onOpen={next => { setView('month'); go(next) }} />
      ) : (
        <>
          {complete.length > 0 && <CalendarStats stats={stats} total={monthSummary(complete)} currency={currency} />}
          {data?.refreshing && <p className="text-xs text-fg-subtle mb-2">Descargando precios de cierre…</p>}
          {isError && <p className="text-xs text-fg-subtle py-6 text-center">No se pudo cargar el P&L del mes.</p>}
          {isLoading && (
            <div role="status" aria-label="Cargando el calendario" className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: 35 }, (_, i) => <Skeleton key={i} className="h-16" />)}
            </div>
          )}
          {!isError && (
            <div key={`${ym.year}-${ym.month}`} className="animate-page-in">
              <CalendarMonthGrid weeks={weeks} byDate={byDate} totals={totals} today={today} maxAbs={maxAbs} currency={currency}
                selected={selected} onSelect={d => setSelected(s => (s === d ? null : d))} caption={`P&L diario de ${monthLabel(ym)}`} />
            </div>
          )}
          <CalendarLegend maxAbs={maxAbs} currency={currency} />
          {selected && byDate.get(selected) && (
            <CalendarDayDetail date={selected} day={byDate.get(selected)} onClose={() => setSelected(null)} />
          )}
        </>
      )}
    </div>
  )
}
