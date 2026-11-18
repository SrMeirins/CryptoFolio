import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { WEEKDAYS, type CalendarDay } from '../../../utils/pnlCalendar'
import { gridMove } from '../../../utils/calendarStats'
import { heatVars } from '../../../utils/topMovers'
import type { Currency } from '../../../utils/format'
import { longDate, signedMoney, signedPct, signedTiny } from './format'

// Cuadrícula del mes (#167, #216), con teselas opacas desde #512: cada día con
// su importe y su % visibles y el fondo con la intensidad del día; columna con
// el total de cada semana y una barra proporcional a la mayor semana del mes.
// En estrecho (menos de sm) la tesela muestra el importe abreviado sin % y el
// total de la semana pasa a una fila bajo ella: el mes cabe sin desplazamiento.
// Teclado (patrón grid del WAI-ARIA): un solo día en el orden de tabulación;
// las flechas cruzan de mes (el calendario pasa al mes del destino).

/** Color de la cifra sobre el fondo tintado: las variantes «ink» mantienen el contraste. */
const inkOf = (n: number) => (n > 0 ? 'text-positive-ink' : n < 0 ? 'text-negative-ink' : 'text-fg-muted')

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

function Cifra({ pnl, currency, live }: { pnl: number; currency: Currency; live: boolean }) {
  const dir = useChangeDirection(pnl)
  const tono = `font-semibold mono tabular-nums ${inkOf(pnl)} ${live && dir ? 'live-tick' : ''}`
  return (
    <span key={live ? pnl : undefined} className={tono}>
      <span className="hidden sm:inline text-[13px]">{signedMoney(pnl, currency)}</span>
      <span className="sm:hidden text-[9.5px] tracking-tighter whitespace-nowrap">{signedTiny(pnl)}</span>
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
  /** Resaltado desde el gráfico del periodo. */
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

  return (
    <td role="gridcell" className="px-0.5 sm:px-1 py-[3px] align-top" aria-selected={selected}>
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
        style={hasData ? heatVars(data.pnl, maxAbs) as CSSProperties : undefined}
        className={`group relative block w-full ${compact ? 'h-7' : 'h-12 sm:h-14'} rounded-lg sm:rounded-xl text-left transition-[transform,box-shadow] duration-150
          focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand motion-reduce:transition-none
          ${hasData ? 'tesela cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_10px_22px_-14px_var(--card)]' : 'cursor-default'}
          ${!hasData && !future ? 'bg-overlay/3' : ''} ${future ? 'opacity-35' : ''}
          ${selected ? 'ring-2 ring-brand' : highlighted ? 'ring-2 ring-fg/40' : ''}
          ${data?.live && !selected ? 'calendar-live' : ''}`}
      >
        <span aria-hidden="true" className={`absolute top-1 left-1.5 sm:top-1.5 sm:left-2 text-[10px] sm:text-[11px] mono ${hasData ? 'text-fg' : 'text-fg-subtle'}`}>{dayNumber}</span>
        {data?.live && <span aria-hidden="true" className="absolute top-1 right-1.5 sm:top-1.5 sm:right-2 text-[10px] font-semibold text-brand-ink">hoy</span>}
        {hasData ? (
          <span aria-hidden="true" className="absolute inset-x-1 sm:inset-x-2 bottom-1.5 sm:bottom-2 flex items-baseline justify-between gap-1.5 overflow-hidden">
            <Cifra pnl={data.pnl} currency={currency} live={data.live} />
            <span className="hidden sm:inline min-w-0 truncate text-[10.5px] mono tabular-nums text-fg">
              {data.pct === null ? '' : signedPct(data.pct)}
            </span>
          </span>
        ) : !future && !compact && <span aria-hidden="true" className="absolute inset-x-0 bottom-2 text-center text-xs mono text-fg-subtle">—</span>}
      </button>
    </td>
  )
}

/** Total de la semana (#412, barra desde #512): cifra con el color de su signo y barra proporcional a la mayor semana. */
function WeekTotal({ value, max, currency }: { value: number; max: number; currency: Currency }) {
  const color = value > 0 ? 'text-positive-ink' : value < 0 ? 'text-negative-ink' : 'text-fg-subtle'
  const barra = value > 0 ? 'bg-positive' : value < 0 ? 'bg-negative' : 'bg-fg-subtle/40'
  const ancho = max > 0 ? Math.max(4, (Math.abs(value) / max) * 100) : 0
  return (
    <span className="inline-flex flex-col items-end gap-1 w-full">
      <span className={`text-[11px] leading-4 mono font-semibold whitespace-nowrap ${color}`}>{signedMoney(value, currency)}</span>
      <span aria-hidden="true" className="block h-1 w-full rounded-full bg-overlay/6 overflow-hidden">
        <span className={`block h-full rounded-full ml-auto ${barra} transition-[width] duration-500`} style={{ width: `${ancho}%` }} />
      </span>
    </span>
  )
}

export function CalendarMonthGrid({ weeks, byDate, totals, today, maxAbs, currency, selected, onSelect, caption, hovered, onHover, onNavigate, focusDate }: {
  weeks: (string | null)[][]
  byDate: ReadonlyMap<string, CalendarDay>
  totals: Array<number | null>
  today: string
  maxAbs: number
  currency: Currency
  selected: string | null
  onSelect: (date: string) => void
  caption: string
  /** Día resaltado (desde la cuadrícula o el gráfico del periodo). */
  hovered: string | null
  onHover: (date: string | null) => void
  /** Las flechas salen del mes: el calendario pasa al mes de ese día. */
  onNavigate?: (date: string) => void
  /** Día al que llevar el foco al montar (tras cruzar de mes). */
  focusDate?: string | null
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const days = weeks.flat().filter((d): d is string => !!d)
  const [focused, setFocused] = useState<string | null>(focusDate ?? null)
  // Día en el orden de tabulación: el que tiene el foco, el elegido, hoy o el primero del mes.
  const tabDate = [focused, selected, today].find(d => d && days.includes(d)) ?? days[0]
  const maxSemana = totals.reduce<number>((m, t) => Math.max(m, Math.abs(t ?? 0)), 0)

  // Tras cruzar de mes con las flechas, el foco sigue en el día de destino.
  useEffect(() => {
    if (focusDate) refs.current[focusDate]?.focus()
  }, [focusDate])

  function onKey(e: KeyboardEvent<HTMLButtonElement>, date: string) {
    if (e.key === 'Escape' && selected) { onSelect(selected); return }
    const next = gridMove(date, e.key)
    if (!next) return
    e.preventDefault()
    if (!days.includes(next)) {
      if (next <= today) onNavigate?.(next)
      return
    }
    setFocused(next)
    refs.current[next]?.focus()
  }

  return (
    <div className="py-0.5">
      <table role="grid" className="w-full table-fixed" aria-label={caption}>
        <thead>
          <tr>
            {WEEKDAYS.map((d, i) => (
              <th key={d} scope="col" abbr={WEEKDAY_NAMES[i]} className="text-xs font-medium text-fg-subtle pb-1">{d}</th>
            ))}
            <th scope="col" abbr="total de la semana" className="hidden sm:table-cell text-xs font-medium text-fg-subtle pb-1 w-24 text-right pr-1">Semana</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => {
            const clave = week.find(Boolean) ?? `semana-${wi}`
            const total = totals[wi]
            return [
              <tr key={clave}>
                {week.map((date, i) => date
                  ? <DayCell key={date} date={date} data={byDate.get(date)} today={today} maxAbs={maxAbs} currency={currency}
                      selected={selected === date} focusable={tabDate === date} onSelect={onSelect} onKey={onKey}
                      highlighted={hovered === date} onHover={onHover} compact={week.every(d => !d || d > today)}
                      register={(d, el) => { refs.current[d] = el }} />
                  : <td key={`vacío-${i}`} className="p-0.5" aria-hidden="true" />)}
                <td className="hidden sm:table-cell py-0.5 pl-2 pr-1 align-middle text-right">
                  {total !== null && total !== undefined && <WeekTotal value={total} max={maxSemana} currency={currency} />}
                </td>
              </tr>,
              // En estrecho, el total de la semana en una fila propia bajo ella.
              total !== null && total !== undefined && (
                <tr key={`${clave}-total`} className="sm:hidden">
                  <td colSpan={7} className="px-1 pb-1.5">
                    <span className="flex items-center gap-2 text-[10px] text-fg-subtle">
                      <span className="shrink-0">Semana</span>
                      <WeekTotalInline value={total} max={maxSemana} currency={currency} />
                    </span>
                  </td>
                </tr>
              ),
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}

function WeekTotalInline({ value, max, currency }: { value: number; max: number; currency: Currency }) {
  const color = value > 0 ? 'text-positive-ink' : value < 0 ? 'text-negative-ink' : 'text-fg-subtle'
  const barra = value > 0 ? 'bg-positive' : value < 0 ? 'bg-negative' : 'bg-fg-subtle/40'
  const ancho = max > 0 ? Math.max(4, (Math.abs(value) / max) * 100) : 0
  return (
    <>
      <span aria-hidden="true" className="flex-1 h-1 rounded-full bg-overlay/6 overflow-hidden">
        <span className={`block h-full rounded-full ${barra}`} style={{ width: `${ancho}%` }} />
      </span>
      <span className={`shrink-0 mono font-semibold text-[11px] ${color}`}>{signedMoney(value, currency)}</span>
    </>
  )
}
