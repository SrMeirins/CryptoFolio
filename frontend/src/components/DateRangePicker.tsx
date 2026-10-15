import { useState, useRef } from 'react'
import { ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react'
import { useClickOutside } from '../hooks/useClickOutside'
import {
  DAYS_ES, MONTHS_ES, today, startOfMonth, startOfYear,
  parseDate, fmtShort, getDaysInGrid, inDateRange,
} from '../utils/date'
import { iconButtonClasses } from './ui'

interface Props {
  from:     string   // 'YYYY-MM-DD' o ''
  to:       string
  onChange: (from: string, to: string) => void
  /** Texto del disparador sin rango elegido. */
  placeholder?: string
  /** Lado al que se alinea el desplegable (a la derecha si el disparador está al borde derecho). */
  align?: 'left' | 'right'
  /** Último día seleccionable (p. ej. hoy); los posteriores quedan deshabilitados. */
  max?: string
}

interface DayCellProps {
  day:        string
  isFrom:     boolean
  isTo:       boolean
  isInRange:  boolean
  isToday:    boolean
  disabled:   boolean
  onClick:    () => void
  onHover:    () => void
  onHoverEnd: () => void
}

function DayCell({ day, isFrom, isTo, isInRange, isToday, disabled, onClick, onHover, onHoverEnd }: DayCellProps) {
  const isSingle = isFrom && isTo
  const isStart  = isFrom && !isSingle
  const isEnd    = isTo   && !isSingle
  const dayNum   = parseInt(day.slice(8))

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onHoverEnd}
      disabled={disabled}
      className={`
        relative h-8 text-xs font-medium transition-all duration-100 select-none disabled:opacity-30 disabled:pointer-events-none
        ${isInRange ? 'bg-brand/12 text-fg' : ''}
        ${isStart   ? 'rounded-l-full' : ''}
        ${isEnd     ? 'rounded-r-full' : ''}
        ${isSingle  ? 'rounded-full' : ''}
        ${!isFrom && !isTo && !isInRange ? 'hover:bg-overlay/8 rounded-full text-fg' : ''}
      `}
    >
      {/* Fondo del día seleccionado (from/to) */}
      {(isFrom || isTo) && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold bg-brand-solid text-on-brand">
            {dayNum}
          </span>
        </span>
      )}

      {/* Número del día */}
      {!isFrom && !isTo && (
        <span className={`relative z-10 ${isToday ? 'text-brand font-bold' : ''}`}>
          {dayNum}
        </span>
      )}

      {/* Punto "hoy" */}
      {isToday && !isFrom && !isTo && (
        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand-solid text-on-brand" />
      )}
    </button>
  )
}

export function DateRangePicker({ from, to, onChange, placeholder = 'Rango de fechas', align = 'left', max }: Props) {
  const [open,     setOpen]     = useState(false)
  const [hover,    setHover]    = useState<string | null>(null)
  const [picking,  setPicking]  = useState<'from' | 'to'>('from')
  const [tmpFrom,  setTmpFrom]  = useState(from)
  const [tmpTo,    setTmpTo]    = useState(to)

  const now      = new Date()
  const [viewY,  setViewY]  = useState(now.getFullYear())
  const [viewM,  setViewM]  = useState(now.getMonth())

  const ref = useRef<HTMLDivElement>(null)

  // Cerrar al clicar fuera
  useClickOutside(ref, close, open)

  function openPicker() {
    setTmpFrom(from); setTmpTo(to); setPicking('from')
    // Navegar al mes del from si existe, si no al mes actual
    const d = parseDate(from) ?? new Date()
    setViewY(d.getFullYear()); setViewM(d.getMonth())
    setOpen(true)
  }

  function close() { setOpen(false); setHover(null) }

  function apply(f: string, t: string) {
    const [a, b] = f && t && f > t ? [t, f] : [f, t]
    onChange(a, b)
    close()
  }

  function handleDayClick(d: string) {
    if (picking === 'from') {
      setTmpFrom(d); setTmpTo(''); setPicking('to')
    } else {
      if (!tmpFrom) { setTmpFrom(d); setPicking('to'); return }
      const [a, b] = d < tmpFrom ? [d, tmpFrom] : [tmpFrom, d]
      setTmpFrom(a); setTmpTo(b)
      setPicking('from')
      apply(a, b)
    }
  }

  function prevMonth() {
    if (viewM === 0) { setViewM(11); setViewY(y => y - 1) }
    else setViewM(m => m - 1)
  }
  function nextMonth() {
    if (viewM === 11) { setViewM(0); setViewY(y => y + 1) }
    else setViewM(m => m + 1)
  }

  function applyShortcut(f: string, t: string) {
    setTmpFrom(f); setTmpTo(t); setPicking('from')
    const d = parseDate(f) ?? new Date()
    setViewY(d.getFullYear()); setViewM(d.getMonth())
    apply(f, t)
  }

  const cells    = getDaysInGrid(viewY, viewM)
  const todayStr = today()

  // Rango activo para preview (tmpFrom + hover mientras picking === 'to')
  const previewFrom = tmpFrom
  const previewTo   = picking === 'to' && hover ? hover : tmpTo

  // Etiqueta del botón trigger
  const label = from && to
    ? from === to
      ? fmtShort(from)
      : `${fmtShort(from)} – ${fmtShort(to)}`
    : from
    ? `Desde ${fmtShort(from)}`
    : placeholder

  const hasRange = !!(from || to)

  const SHORTCUTS = [
    { label: 'Hoy',    f: () => { const t = today(); applyShortcut(t, t) } },
    { label: 'Mes',    f: () => { const n = new Date(); applyShortcut(startOfMonth(n), today()) } },
    { label: 'Año',    f: () => { applyShortcut(startOfYear(new Date()), today()) } },
    { label: 'Todo',   f: () => { onChange('', ''); close() } },
  ]

  return (
    <div ref={ref} className="relative">

      {/* Disparador y botón de quitar, hermanos: antes el de quitar iba dentro
          del disparador (un botón dentro de otro no es HTML válido). */}
      <div className={`flex items-center rounded-lg text-xs border transition-all ${
        hasRange
          ? 'bg-brand/10 border-brand/40 text-brand'
          : 'bg-background-tertiary border-border text-fg-muted hover:border-fg-subtle hover:text-fg'
      }`}>
        <button
          type="button"
          onClick={openPicker}
          aria-expanded={open}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Calendar size={11} aria-hidden="true" />
          <span className="max-w-[160px] truncate">{label}</span>
        </button>
        {hasRange && (
          <button
            type="button"
            onClick={() => onChange('', '')}
            aria-label="Quitar filtro de fechas"
            className={iconButtonClasses('sm', false, '-ml-1 mr-1', 'brand')}
          >
            <X size={10} />
          </button>
        )}
      </div>

      {/* Popover */}
      {open && (
        <div
          className={`absolute top-full mt-2 z-50 ${align === 'right' ? 'right-0' : 'left-0'} bg-background-primary border border-overlay/12 rounded-xl shadow-2xl overflow-hidden animate-date-picker-in`}
          style={{ minWidth: 280 }}
        >
          {/* Atajos */}
          <div className="flex items-center gap-1 px-3 pt-3 pb-2">
            {SHORTCUTS.map(s => {
              const isActive = s.label === 'Todo'
                ? !from && !to
                : s.label === 'Hoy'
                  ? from === todayStr && to === todayStr
                  : s.label === 'Mes'
                    ? from === startOfMonth(new Date()) && to === todayStr
                    : s.label === 'Año'
                      ? from === startOfYear(new Date()) && to === todayStr
                      : false
              return (
                <button
                  type="button"
                  key={s.label}
                  onClick={s.f}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-brand/20 text-brand border border-brand/30'
                      : 'bg-overlay/5 text-fg-muted hover:bg-overlay/8 hover:text-fg border border-transparent'
                  }`}
                >
                  {s.label}
                </button>
              )
            })}
          </div>

          <div className="h-px bg-overlay/6 mx-3" />

          {/* Navegación mes */}
          <div className="flex items-center justify-between px-3 py-2.5">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="Mes anterior"
              className={iconButtonClasses('md')}
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-semibold">
              {MONTHS_ES[viewM]} <span className="text-fg-subtle font-normal">{viewY}</span>
            </span>
            <button
              type="button"
              onClick={nextMonth}
              aria-label="Mes siguiente"
              className={iconButtonClasses('md')}
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Grid */}
          <div className="px-3 pb-3">
            {/* Cabecera días */}
            <div className="grid grid-cols-7 mb-1">
              {DAYS_ES.map(d => (
                <div key={d} className="text-center text-xs font-medium text-fg-subtle py-1">{d}</div>
              ))}
            </div>

            {/* Días */}
            <div className="grid grid-cols-7 gap-y-0.5">
              {cells.map((d, i) => d
                ? (
                  <DayCell
                    key={d}
                    day={d}
                    isFrom={d === previewFrom}
                    isTo={d === previewTo && previewTo !== ''}
                    isInRange={inDateRange(d, previewFrom, previewTo)}
                    isToday={d === todayStr}
                    disabled={max !== undefined && d > max}
                    onClick={() => handleDayClick(d)}
                    onHover={() => picking === 'to' && setHover(d)}
                    onHoverEnd={() => setHover(null)}
                  />
                )
                : <div key={i} />
              )}
            </div>

            {/* Indicador de selección en curso */}
            {picking === 'to' && tmpFrom && (
              <p className="text-center text-xs text-fg-subtle mt-2">
                Desde <span className="text-fg-muted">{fmtShort(tmpFrom)}</span> — selecciona fecha de fin
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
