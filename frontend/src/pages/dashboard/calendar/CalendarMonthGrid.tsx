import { useRef, useState, type KeyboardEvent } from 'react'
import { WEEKDAYS, type CalendarDay } from '../../../utils/pnlCalendar'
import { gridMove } from '../../../utils/calendarStats'
import { heatBackground } from '../../../utils/topMovers'
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
    <span key={pnl} className={`block ${dir ? 'live-tick' : ''} ${tone}`}>
      {signedMoney(pnl, currency)}
    </span>
  )
}

function DayCell({ date, data, today, maxAbs, currency, selected, focusable, highlighted, compact, onSelect, onKey, onHover, register }: {
  date: string
  data?: CalendarDay
  today: string
  maxAbs: number
  currency: Currency
  selected: boolean
  focusable: boolean
  /** Resaltado desde el gráfico del mes. */
  highlighted: boolean
  /** Semana enteramente futura: fila compacta. */
  compact: boolean
  onSelect: (date: string) => void
  onKey: (e: KeyboardEvent<HTMLButtonElement>, date: string) => void
  onHover: (date: string | null) => void
  register: (date: string, el: HTMLButtonElement | null) => void
}) {
  const dayNumber = Number(date.slice(8))
  const future = date > today
  const hasData = !!data && data.complete && !future
  const label = future
    ? `${longDate(date)}: día futuro`
    : !data ? `${longDate(date)}: sin datos`
    : !data.complete ? `${longDate(date)}: calculando`
    : `${longDate(date)}${data.live ? ' (hoy desde las 00:00, en vivo)' : ''}: ${signedMoney(data.pnl, currency)}${data.pct === null ? '' : `, ${signedPct(data.pct)}`}`
  const barWidth = hasData && maxAbs > 0 ? Math.min(100, (Math.abs(data.pnl) / maxAbs) * 100) : 0

  return (
    <td role="gridcell" className="p-[3px] align-top" aria-selected={selected}>
      <button
        type="button"
        ref={el => register(date, el)}
        tabIndex={focusable ? 0 : -1}
        aria-label={label}
        aria-disabled={!hasData || undefined}
        onClick={() => hasData && onSelect(date)}
        onKeyDown={e => onKey(e, date)}
        onMouseEnter={() => onHover(date)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(date)}
        onBlur={() => onHover(null)}
        // Mosaico (#234): color con la escala del mapa de calor, sin borde, relieve suave.
        style={hasData ? { background: heatBackground(data.pnl, maxAbs) } : undefined}
        className={`group relative w-full ${compact ? 'h-8' : 'h-[68px]'} rounded-xl overflow-hidden text-left transition-[transform,box-shadow,opacity] duration-150
          focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand motion-reduce:transition-none
          ${hasData ? 'cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_1px_2px_rgba(0,0,0,0.2)] hover:-translate-y-px hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_6px_16px_rgba(0,0,0,0.3)]' : 'cursor-default'}
          ${!hasData && !future ? 'bg-overlay/3' : ''} ${future ? 'opacity-35' : ''}
          ${selected ? 'ring-2 ring-brand' : highlighted ? 'ring-2 ring-fg/40' : ''}
          ${data?.live && !selected ? 'calendar-live' : ''}`}
      >
        <span aria-hidden="true" className={`absolute top-1.5 left-2 text-[11px] mono ${hasData ? 'text-fg' : 'text-fg-subtle'}`}>{dayNumber}</span>
        {data?.live && <span aria-hidden="true" className="absolute top-1.5 right-2 text-[10px] font-semibold text-brand">● hoy</span>}
        {hasData ? (
          <span aria-hidden="true" className="absolute inset-x-2 bottom-2.5 flex flex-col">
            {data.live
              ? <LiveFigure pnl={data.pnl} currency={currency} tone="text-[13px] font-semibold mono text-fg truncate" />
              : <span className="text-[13px] font-semibold mono text-fg truncate">{signedMoney(data.pnl, currency)}</span>}
            {/* El % aparece al pasar el cursor o al enfocar; siempre está en el detalle y en el nombre accesible. */}
            <span className="text-[11px] mono text-fg h-0 opacity-0 group-hover:h-auto group-hover:opacity-100 group-focus-visible:h-auto group-focus-visible:opacity-100 transition-opacity">
              {data.pct === null ? '—' : signedPct(data.pct)}
            </span>
          </span>
        ) : !future && !compact && <span aria-hidden="true" className="absolute inset-x-0 bottom-3 text-center text-xs mono text-fg-subtle">—</span>}
        {/* Barra proporcional a la magnitud del día */}
        {hasData && (
          <span aria-hidden="true" className={`absolute left-0 bottom-0 h-[3px] ${data.pnl >= 0 ? 'bg-positive' : 'bg-negative'}`} style={{ width: `${barWidth}%` }} />
        )}
      </button>
    </td>
  )
}

export function CalendarMonthGrid({ weeks, byDate, totals, today, maxAbs, currency, selected, onSelect, caption, hovered, onHover }: {
  weeks: (string | null)[][]
  byDate: ReadonlyMap<string, CalendarDay>
  totals: Array<number | null>
  today: string
  maxAbs: number
  currency: Currency
  selected: string | null
  onSelect: (date: string) => void
  caption: string
  /** Día resaltado (desde la cuadrícula o el gráfico del mes). */
  hovered: string | null
  onHover: (date: string | null) => void
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
                    highlighted={hovered === date} onHover={onHover} compact={week.every(d => !d || d > today)}
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
