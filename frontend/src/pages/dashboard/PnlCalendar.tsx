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

// Calendario mensual de ganancias y pérdidas diarias (#167), sobre
// GET /api/v1/pnl/daily. El día de hoy se actualiza en vivo (reconsulta cada minuto).

const WEEKDAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const GREEN_BG = ['', 'bg-accent-green/[0.07]', 'bg-accent-green/13', 'bg-accent-green/20', 'bg-accent-green/30']
const RED_BG = ['', 'bg-accent-red/[0.07]', 'bg-accent-red/13', 'bg-accent-red/20', 'bg-accent-red/30']

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
        <div className="h-16 rounded-lg border border-border/40 px-2 py-1.5 text-gray-600">
          {reason && <span className="sr-only">{`${longDate(date)}: ${reason}`}</span>}
          <span className="text-[10px] font-mono" aria-hidden={reason ? true : undefined}>{dayNumber}</span>
          {!future && <p className="text-[11px] font-mono text-center mt-1" aria-hidden="true">—</p>}
        </div>
      </td>
    )
  }

  const positive = data.pnl >= 0
  const level = intensity(data.pnl, maxAbs)
  const tone = data.pnl === 0 ? 'text-gray-400' : positive ? 'text-accent-green' : 'text-accent-red'
  const bg = data.pnl === 0 ? '' : (positive ? GREEN_BG : RED_BG)[level]
  const pctText = data.pct === null ? '—' : signedPct(data.pct)

  return (
    <td className="p-1 align-top">
      <div className={`h-16 rounded-lg border px-2 py-1.5 ${bg} ${data.live ? 'border-accent-blue/60' : 'border-border/40'}`}>
        <span className="sr-only">
          {`${longDate(date)}${data.live ? ' (hoy, en vivo)' : ''}: ${signedMoney(data.pnl, currency)}${data.pct === null ? '' : `, ${pctText}`}`}
        </span>
        <div className="flex items-center justify-between text-[10px] font-mono text-gray-500" aria-hidden="true">
          <span>{dayNumber}</span>
          {data.live && <span className="text-accent-blue">● en vivo</span>}
        </div>
        <p className={`text-[11px] font-mono font-semibold leading-tight mt-1 truncate ${tone}`} aria-hidden="true">{signedMoney(data.pnl, currency)}</p>
        <p className={`text-[10px] font-mono leading-tight opacity-80 ${tone}`} aria-hidden="true">{pctText}</p>
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

  const byDate = useMemo(() => new Map((data?.days ?? []).map(d => [d.date, d])), [data])
  const complete = useMemo(() => (data?.days ?? []).filter(d => d.complete), [data])
  const summary = monthSummary(complete)
  const maxAbs = complete.reduce((m, d) => Math.max(m, Math.abs(d.pnl)), 0)
  const weeks = monthGrid(ym)

  const canPrev = !firstYm || compareYm(ym, firstYm) > 0
  const canNext = compareYm(ym, current) < 0
  const summaryTone = summary.pnl >= 0 ? 'text-accent-green' : 'text-accent-red'

  return (
    <div className="bg-background-card border border-border rounded-2xl px-5 py-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-[11px] text-gray-600 font-medium uppercase tracking-widest mr-1">P&L diario</h3>
          <button type="button" onClick={() => setYm(addMonths(ym, -1))} disabled={!canPrev} aria-label="Mes anterior"
            className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-blue/60">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-white min-w-38 text-center" aria-live="polite">{monthLabel(ym)}</span>
          <button type="button" onClick={() => setYm(addMonths(ym, 1))} disabled={!canNext} aria-label="Mes siguiente"
            className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-blue/60">
            <ChevronRight size={16} />
          </button>
        </div>
        {complete.length > 0 && (
          <p className={`text-xs font-mono ${summaryTone}`}>
            Mes: <span className="font-semibold">{signedMoney(summary.pnl, currency)}</span> ({signedPct(summary.pct)})
          </p>
        )}
        {data?.refreshing && <span className="text-[10px] text-gray-500">Descargando precios de cierre…</span>}
      </div>

      {isError && <p className="text-xs text-gray-500 py-6 text-center">No se pudo cargar el P&L del mes.</p>}
      {isLoading && <p className="text-xs text-gray-600 py-6 text-center">Cargando…</p>}

      {!isError && (
        <div className="overflow-x-auto">
          <table className="w-full table-fixed min-w-136">
            <caption className="sr-only">P&L diario de {monthLabel(ym)}</caption>
            <thead>
              <tr>
                {WEEKDAYS.map((d, i) => (
                  <th key={d} scope="col" abbr={WEEKDAY_NAMES[i]} className="text-[10px] font-medium text-gray-600 pb-1">{d}</th>
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
