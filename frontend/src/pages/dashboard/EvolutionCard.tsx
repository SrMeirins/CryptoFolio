import { useId, useMemo, useState } from 'react'
import { PnlChart, type PnlUnit } from './PnlChart'
import { ValueChart } from './ValueChart'
import { EvolutionSummary } from './EvolutionSummary'
import { CalendarDayDetail } from './calendar/CalendarDayDetail'
import { DateRangePicker } from '../../components/DateRangePicker'
import { SegmentedControl, Tabs, cardClasses, tabId, tabPanelId, PanelHeader } from '../../components/ui'
import { useCurrencyQuery } from '../../hooks/useCurrencyQuery'
import { usePreparacionHistoricos } from '../../hooks/usePreparacionHistoricos'
import { PreparandoHistoricos } from '../../components/PreparandoHistoricos'
import { useLiveDayPnl } from '../../hooks/useLiveDayPnl'
import { dailyPnlQuery, intradayPnlQuery } from '../../queries/currencyQueries'
import { METRIC_LABELS, PERIOD_TITLES, PNL_PERIODS, madridToday, metricFor, type PnlPeriod } from '../../utils/pnlChart'
import { evolutionQuery, fromDaily, fromIntraday } from '../../utils/evolutionSeries'
import { applyLiveToday, periodSummary } from '../../utils/evolutionSummary'
import { evolutionSubtitle } from '../../utils/panelSubtitles'
import { LineChart } from 'lucide-react'

// Bloque de evolución del Dashboard (#166): pestaña P&L (rentabilidad
// acumulada, por defecto) y pestaña Valor (valor de la cartera). Desde #215
// ambas comparten periodo (24H, 7D…Todo y rango personalizado) y la misma
// consulta, así que cambiar de pestaña es inmediato y conserva el periodo.

type Tab = 'pnl' | 'value'

const TABS: { id: Tab; label: string }[] = [
  { id: 'pnl', label: 'P&L' },
  { id: 'value', label: 'Valor' },
]

export function EvolutionCard() {
  const [tab, setTab] = useState<Tab>('pnl')
  const [period, setPeriod] = useState<PnlPeriod>('Todo')
  const [range, setRange] = useState<{ from: string; to: string } | null>(null)
  const [unit, setUnit] = useState<PnlUnit>('pct')
  // Día del mejor o peor resultado cuyo detalle se muestra bajo el resumen (#250).
  const [openDay, setOpenDay] = useState<{ day: string; key: string } | null>(null)
  const baseId = useId()
  const today = madridToday()
  const query = evolutionQuery(period, today, range)

  // Mientras el servidor descarga cierres se reconsulta cada 5 s; después, cada minuto.
  const daily = useCurrencyQuery(
    c => dailyPnlQuery(c, query.intraday ? undefined : query.from, query.intraday ? undefined : query.to),
    { enabled: !query.intraday, refetchInterval: q => (q.state.data?.refreshing ? 5_000 : 60_000) },
  )
  const intraday = useCurrencyQuery(intradayPnlQuery, { enabled: query.intraday, refetchInterval: 60_000 })
  const active = query.intraday ? intraday : daily
  const currency = active.data?.currency ?? active.currency

  const metric = metricFor(period)
  const series = useMemo(
    () => (query.intraday ? fromIntraday(intraday.data?.points ?? []) : fromDaily(daily.data?.days ?? [], period)),
    [query.intraday, intraday.data, daily.data, period],
  )
  // El día de hoy se mueve con los precios en vivo (#213, #214).
  const liveToday = useLiveDayPnl(query.intraday ? null : daily.data?.today, currency)
  const points = useMemo(() => applyLiveToday(series, liveToday, metric), [series, liveToday, metric])
  const summary = useMemo(() => periodSummary(points, query.intraday), [points, query.intraday])
  const valueChange = points.length >= 2 ? points[points.length - 1].value - points[0].value : null
  const labels = METRIC_LABELS[metric]
  const approximate = query.intraday ? intraday.data?.approximate ?? [] : []
  const preparacion = usePreparacionHistoricos()
  const animationKey = `${period}-${range?.from ?? ''}-${range?.to ?? ''}-${tab}-${unit}`
  // Al cambiar de periodo o de rango el detalle abierto deja de aplicar.
  const periodKey = `${period}-${range?.from ?? ''}-${range?.to ?? ''}`
  const detailDay = openDay?.key === periodKey ? openDay.day : null
  const toggleDay = (day: string) => setOpenDay(o => (o?.day === day && o.key === periodKey ? null : { day, key: periodKey }))

  function pickRange(from: string, to: string) {
    if (!from && !to) {
      setRange(null)
      if (period === 'Rango') setPeriod('Todo')
      return
    }
    setRange({ from, to })
    setPeriod('Rango')
  }

  const state = { loading: active.isLoading, error: active.isError, intraday: query.intraday, currency, points, animationKey }

  return (
    <div className={cardClasses('none', 'px-5 py-5')}>
      <PanelHeader
        icon={LineChart}
        title="Evolución"
        className="mb-3"
        subtitle={evolutionSubtitle(period, series[0]?.x ?? null, range)}
        extra={<Tabs label="Evolución del portfolio" idBase={baseId} value={tab} onChange={setTab}
          items={TABS.map(t => ({ value: t.id, label: t.label }))} />}
        actions={<>
          <SegmentedControl label="Periodo del gráfico de evolución" variant="accent" value={period} onChange={p => { setPeriod(p); setRange(null) }}
            options={PNL_PERIODS.map(p => ({ value: p, label: p, title: PERIOD_TITLES[p] }))} />
          <DateRangePicker
            placeholder="Rango"
            align="right"
            max={today}
            from={period === 'Rango' ? range?.from ?? '' : ''}
            to={period === 'Rango' ? range?.to ?? '' : ''}
            onChange={pickRange}
          />
        </>}
      />

      <div id={tabPanelId(baseId)} role="tabpanel" aria-labelledby={tabId(baseId, tab)}>
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
