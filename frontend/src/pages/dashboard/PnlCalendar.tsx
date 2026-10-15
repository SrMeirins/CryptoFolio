import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatMoney, type Currency } from '../../utils/format'
import { useCurrencyQuery } from '../../hooks/useCurrencyQuery'
import { dailyPnlQuery } from '../../queries/currencyQueries'
import { madridToday } from '../../utils/pnlChart'
import {
  WEEKDAYS, addMonths, compareYm, intensity, monthGrid, monthLabel, monthRange, monthSummary, ymOf,
  type CalendarDay, type YearMonth,
} from '../../utils/pnlCalendar'
import { cardClasses, iconButtonClasses } from '../../components/ui'
import { InfoTooltip } from '../../components/InfoTooltip'
import { useLiveDayPnl } from '../../hooks/useLiveDayPnl'

// Calendario mensual de ganancias y pérdidas diarias (#167), sobre
// GET /api/v1/pnl/daily. El día de hoy se recalcula con cada precio en vivo
// sobre la base que devuelve el servidor (#213).

const WEEKDAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const GREEN_BG = ['', 'bg-positive/[0.07]', 'bg-positive/13', 'bg-positive/20', 'bg-positive/30']
const RED_BG = ['', 'bg-negative/[0.07]', 'bg-negative/13', 'bg-negative/20', 'bg-negative/30']

const signedMoney = (n: number, currency: Currency) => `${n > 0 ? '+' : ''}${formatMoney(n, currency)}`
const signedPct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(2)}%`

function longDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function DayCell({ date, data, today, maxAbs, currency }: {
  date: string | null; data?: CalendarDay; today: string; maxAbs: number; currency: Currency
}) {
  if (!date) return <td className="p-1" aria-hidden="true" />
  const dayNumber = Number(date.slice(8))
  const future = date > today

  if (future || !data || !data.complete) {
    const reason = future ? '' : !data ? 'sin datos' : 'calculando'
    return (
      <td className="p-1 align-top">
        <div className="h-16 rounded-lg border border-border/40 px-2 py-1.5 text-fg-subtle">
          {reason && <span className="sr-only">{`${longDate(date)}: ${reason}`}</span>}
          <span className="text-xs mono" aria-hidden={reason ? true : undefined}>{dayNumber}</span>
          {!future && <p className="text-xs mono text-center mt-1" aria-hidden="true">—</p>}
        </div>
      </td>
    )
  }

  const positive = data.pnl >= 0
  const level = intensity(data.pnl, maxAbs)
  const tone = data.pnl === 0 ? 'text-fg-muted' : positive ? 'text-positive' : 'text-negative'
  const bg = data.pnl === 0 ? '' : (positive ? GREEN_BG : RED_BG)[level]
  const pctText = data.pct === null ? '—' : signedPct(data.pct)

  return (
    <td className="p-1 align-top">
      <div className={`h-16 rounded-lg border px-2 py-1.5 ${bg} ${data.live ? 'border-brand/60' : 'border-border/40'}`}>
        <span className="sr-only">
          {`${longDate(date)}${data.live ? ' (hoy desde las 00:00, en vivo)' : ''}: ${signedMoney(data.pnl, currency)}${data.pct === null ? '' : `, ${pctText}`}`}
        </span>
        <div className="flex items-center justify-between text-xs mono text-fg-subtle" aria-hidden="true">
          <span>{dayNumber}</span>
          {data.live && <span className="text-brand">● hoy</span>}
        </div>
        <p className={`text-xs mono font-semibold leading-tight mt-1 truncate ${tone}`} aria-hidden="true">{signedMoney(data.pnl, currency)}</p>
        <p className={`text-xs mono leading-tight opacity-80 ${tone}`} aria-hidden="true">{pctText}</p>
      </div>
    </td>
  )
}

export function PnlCalendar() {
  const today = madridToday()
  const current = ymOf(today)
  const [ym, setYm] = useState<YearMonth>(current)
  const range = monthRange(ym, today)

  // Primer mes con actividad: se toma de la consulta de "Todo" que ya hace el gráfico (misma caché).
  const { data: all } = useCurrencyQuery(currency => dailyPnlQuery(currency))
  const firstYm = all ? ymOf(all.from) : null

  // Mes en la moneda de visualización; la otra se precarga para que el toggle sea instantáneo (#177).
  const { data: monthData, isLoading, isError, currency: requested } = useCurrencyQuery(
    currency => dailyPnlQuery(currency, range?.from, range?.to),
    {
      enabled: range !== null,
      refetchInterval: (query) => (query.state.data?.refreshing ? 5_000 : compareYm(ym, current) === 0 ? 60_000 : false),
    },
  )
  // Un mes futuro (sin rango) compartiría clave con "Todo": se descarta.
  const data = range ? monthData : undefined
  const currency = data?.currency ?? requested

  // Hoy con los precios en vivo (#213): sustituye al valor de la última consulta.
  const live = useLiveDayPnl(data?.today, currency)
  const days = useMemo(() => (data?.days ?? []).map(d =>
    d.live && live && data?.today?.date === d.date ? { ...d, pnl: Math.round(live.pnl * 100) / 100, pct: live.pct } : d,
  ), [data, live])
  const byDate = useMemo(() => new Map(days.map(d => [d.date, d])), [days])
  const complete = useMemo(() => days.filter(d => d.complete), [days])
  const summary = monthSummary(complete)
  const maxAbs = complete.reduce((m, d) => Math.max(m, Math.abs(d.pnl)), 0)
  const weeks = monthGrid(ym)

  const canPrev = !firstYm || compareYm(ym, firstYm) > 0
  const canNext = compareYm(ym, current) < 0
  const summaryTone = summary.pnl >= 0 ? 'text-positive' : 'text-negative'

  return (
    <div className={cardClasses('none', 'px-5 py-5')}>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-[11px] text-fg-subtle font-medium uppercase tracking-widest">P&L diario</h3>
          <InfoTooltip label="Qué mide el P&L diario">
            <p>Ganancia o pérdida de cada día natural, de 00:00 a 24:00 (hora de Madrid), sin contar depósitos ni retiradas.</p>
            <p className="mt-1.5"><span className="text-brand">● hoy</span> se actualiza en vivo desde las 00:00. El chip «24h» de la tarjeta Valor mide en cambio las últimas 24 horas móviles, por eso las cifras no coinciden.</p>
          </InfoTooltip>
          <button type="button" onClick={() => setYm(addMonths(ym, -1))} disabled={!canPrev} aria-label="Mes anterior"
            className={iconButtonClasses('sm', false, 'disabled:hover:bg-transparent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60')}>
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-fg min-w-38 text-center" aria-live="polite">{monthLabel(ym)}</span>
          <button type="button" onClick={() => setYm(addMonths(ym, 1))} disabled={!canNext} aria-label="Mes siguiente"
            className={iconButtonClasses('sm', false, 'disabled:hover:bg-transparent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60')}>
            <ChevronRight size={16} />
          </button>
        </div>
        {complete.length > 0 && (
          <p className={`text-xs mono ${summaryTone}`}>
            Mes: <span className="font-semibold">{signedMoney(summary.pnl, currency)}</span> ({signedPct(summary.pct)})
          </p>
        )}
        {data?.refreshing && <span className="text-xs text-fg-subtle">Descargando precios de cierre…</span>}
      </div>

      {isError && <p className="text-xs text-fg-subtle py-6 text-center">No se pudo cargar el P&L del mes.</p>}
      {isLoading && <p className="text-xs text-fg-subtle py-6 text-center">Cargando…</p>}

      {!isError && (
        <div className="overflow-x-auto">
          <table className="w-full table-fixed min-w-136">
            <caption className="sr-only">P&L diario de {monthLabel(ym)}</caption>
            <thead>
              <tr>
                {WEEKDAYS.map((d, i) => (
                  <th key={d} scope="col" abbr={WEEKDAY_NAMES[i]} className="text-xs font-medium text-fg-subtle pb-1">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, wi) => (
                <tr key={week.find(Boolean) ?? `semana-${wi}`}>
                  {week.map((date, i) => (
                    <DayCell key={date ?? `vacío-${i}`} date={date} data={date ? byDate.get(date) : undefined} today={today} maxAbs={maxAbs} currency={currency} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
