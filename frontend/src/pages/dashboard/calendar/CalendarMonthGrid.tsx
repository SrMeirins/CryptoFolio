import { useRef, useState, type KeyboardEvent } from 'react'
import { WEEKDAYS, type CalendarDay } from '../../../utils/pnlCalendar'
import { colorAlpha, gridMove } from '../../../utils/calendarStats'
import { T, alpha } from '../../../utils/colors'
import type { Currency } from '../../../utils/format'
import { longDate, signedMoney, signedPct, toneOf } from './format'

// Cuadrícula del mes (#167, #216): un botón por día con su P&L y %, color
// continuo según la magnitud, columna con el total de cada semana y navegación
// con flechas (patrón grid del WAI-ARIA: un solo día en el orden de tabulación).

const WEEKDAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

/** Recuerda el valor anterior para el destello al cambiar la cifra del día en vivo. */
function useChangeDirection(value: number): 'up' | 'down' | null {
  const [prev, setPrev] = useState(value)
  const [dir, setDir] = useState<'up' | 'down' | null>(null)
  if (value !== prev) {
    setPrev(value)
    setDir(value > prev ? 'up' : 'down')
  }
  return dir
}

function LiveFigure({ pnl, currency, tone }: { pnl: number; currency: Currency; tone: string }) {
  const dir = useChangeDirection(pnl)
  return (
    <span key={pnl} className={`block rounded-sm ${dir === 'up' ? 'flash-up' : dir === 'down' ? 'flash-down' : ''} ${tone}`}>
      {signedMoney(pnl, currency)}
    </span>
  )
}

function DayCell({ date, data, today, maxAbs, currency, selected, focusable, onSelect, onKey, register }: {
  date: string
  data?: CalendarDay
  today: string
  maxAbs: number
  currency: Currency
  selected: boolean
  focusable: boolean
  onSelect: (date: string) => void
  onKey: (e: KeyboardEvent<HTMLButtonElement>, date: string) => void
  register: (date: string, el: HTMLButtonElement | null) => void
}) {
  const dayNumber = Number(date.slice(8))
  const future = date > today
  const hasData = !!data && data.complete && !future
  const tone = hasData ? toneOf(data.pnl) : 'text-fg-subtle'
  const alphaPct = hasData ? colorAlpha(data.pnl, maxAbs) : 0
  const label = future
    ? `${longDate(date)}: día futuro`
    : !data ? `${longDate(date)}: sin datos`
    : !data.complete ? `${longDate(date)}: calculando`
    : `${longDate(date)}${data.live ? ' (hoy desde las 00:00, en vivo)' : ''}: ${signedMoney(data.pnl, currency)}${data.pct === null ? '' : `, ${signedPct(data.pct)}`}`

  return (
    <td role="gridcell" className="p-0.5 align-top" aria-selected={selected}>
      <button
        type="button"
        ref={el => register(date, el)}
        tabIndex={focusable ? 0 : -1}
        aria-label={label}
        aria-disabled={!hasData || undefined}
        onClick={() => hasData && onSelect(date)}
        onKeyDown={e => onKey(e, date)}
        style={alphaPct ? { backgroundColor: alpha(data!.pnl > 0 ? T.positive : T.negative, alphaPct) } : undefined}
        className={`w-full h-16 rounded-lg border px-2 py-1.5 text-left transition-[transform,border-color] duration-150 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand
          ${hasData ? 'cursor-pointer hover:-translate-y-px' : 'cursor-default'}
          ${selected ? 'border-brand' : data?.live ? 'border-brand/60 calendar-live' : 'border-border/40'}`}
      >
        <span className="flex items-center justify-between text-xs mono text-fg-subtle" aria-hidden="true">
          <span>{dayNumber}</span>
          {data?.live && <span className="text-brand">● hoy</span>}
        </span>
        {hasData ? (
          <span className="block mt-1 text-xs mono leading-tight" aria-hidden="true">
            {data.live
              ? <LiveFigure pnl={data.pnl} currency={currency} tone={`font-semibold truncate ${tone}`} />
              : <span className={`block font-semibold truncate ${tone}`}>{signedMoney(data.pnl, currency)}</span>}
            <span className={`block opacity-80 ${data.pct === null ? tone : toneOf(data.pct)}`}>{data.pct === null ? '—' : signedPct(data.pct)}</span>
          </span>
        ) : !future && <span className="block text-xs mono text-center mt-1 text-fg-subtle" aria-hidden="true">—</span>}
      </button>
    </td>
  )
}

export function CalendarMonthGrid({ weeks, byDate, totals, today, maxAbs, currency, selected, onSelect, caption }: {
  weeks: (string | null)[][]
  byDate: ReadonlyMap<string, CalendarDay>
  totals: Array<number | null>
  today: string
  maxAbs: number
  currency: Currency
  selected: string | null
  onSelect: (date: string) => void
  caption: string
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const days = weeks.flat().filter((d): d is string => !!d)
  const [focused, setFocused] = useState<string | null>(null)
  // Día en el orden de tabulación: el que tiene el foco, el elegido, hoy o el primero del mes.
  const tabDate = [focused, selected, today].find(d => d && days.includes(d)) ?? days[0]

  function onKey(e: KeyboardEvent<HTMLButtonElement>, date: string) {
    if (e.key === 'Escape' && selected) { onSelect(selected); return }
    const next = gridMove(date, e.key)
    if (!next) return
    e.preventDefault()
    setFocused(next)
    refs.current[next]?.focus()
  }

  return (
    <div className="overflow-x-auto">
      <table role="grid" className="w-full table-fixed min-w-148" aria-label={caption}>
        <thead>
          <tr>
            {WEEKDAYS.map((d, i) => (
              <th key={d} scope="col" abbr={WEEKDAY_NAMES[i]} className="text-xs font-medium text-fg-subtle pb-1">{d}</th>
            ))}
            <th scope="col" abbr="total de la semana" className="text-xs font-medium text-fg-subtle pb-1 w-20">Semana</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={week.find(Boolean) ?? `semana-${wi}`}>
              {week.map((date, i) => date
                ? <DayCell key={date} date={date} data={byDate.get(date)} today={today} maxAbs={maxAbs} currency={currency}
                    selected={selected === date} focusable={tabDate === date} onSelect={onSelect} onKey={onKey}
                    register={(d, el) => { refs.current[d] = el }} />
                : <td key={`vacío-${i}`} className="p-0.5" aria-hidden="true" />)}
              <td className="p-0.5 align-middle text-right">
                {totals[wi] !== null && (
                  <span className={`text-xs mono font-medium ${toneOf(totals[wi] ?? 0)}`}>{signedMoney(totals[wi] ?? 0, currency)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
