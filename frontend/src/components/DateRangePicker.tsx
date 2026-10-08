import { useState, useRef } from 'react'
import { ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react'
import { useClickOutside } from '../hooks/useClickOutside'
import {
  DAYS_ES, MONTHS_ES, today, startOfMonth, startOfYear,
  parseDate, fmtShort, getDaysInGrid, inDateRange,
} from '../utils/date'

interface Props {
  from:     string   // 'YYYY-MM-DD' o ''
  to:       string
  onChange: (from: string, to: string) => void
}

interface DayCellProps {
  day:        string
  isFrom:     boolean
  isTo:       boolean
  isInRange:  boolean
  isToday:    boolean
  onClick:    () => void
  onHover:    () => void
  onHoverEnd: () => void
}

function DayCell({ day, isFrom, isTo, isInRange, isToday, onClick, onHover, onHoverEnd }: DayCellProps) {
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
      className={`
        relative h-8 text-xs font-medium transition-all duration-100 select-none
        ${isInRange ? 'bg-accent-blue/12 text-white' : ''}
        ${isStart   ? 'rounded-l-full' : ''}
        ${isEnd     ? 'rounded-r-full' : ''}
        ${isSingle  ? 'rounded-full' : ''}
        ${!isFrom && !isTo && !isInRange ? 'hover:bg-white/8 rounded-full text-gray-300' : ''}
      `}
    >
      {/* Fondo del día seleccionado (from/to) */}
      {(isFrom || isTo) && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold bg-accent-blue text-white">
            {dayNum}
          </span>
        </span>
      )}

      {/* Número del día */}
      {!isFrom && !isTo && (
        <span className={`relative z-10 ${isToday ? 'text-accent-blue font-bold' : ''}`}>
          {dayNum}
        </span>
      )}

      {/* Punto "hoy" */}
      {isToday && !isFrom && !isTo && (
        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent-blue" />
      )}
    </button>
  )
}

export function DateRangePicker({ from, to, onChange }: Props) {
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
    : 'Rango de fechas'

  const hasRange = !!(from || to)

  const SHORTCUTS = [
    { label: 'Hoy',    f: () => { const t = today(); applyShortcut(t, t) } },
    { label: 'Mes',    f: () => { const n = new Date(); applyShortcut(startOfMonth(n), today()) } },
    { label: 'Año',    f: () => { applyShortcut(startOfYear(new Date()), today()) } },
    { label: 'Todo',   f: () => { onChange('', ''); close() } },
  ]

  return (
    <div ref={ref} className="relative">

      {/* Trigger */}
      <button
        type="button"
        onClick={openPicker}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-all ${
          hasRange
            ? 'bg-accent-blue/10 border-accent-blue/40 text-accent-blue'
            : 'bg-background-tertiary border-border text-gray-400 hover:border-gray-500 hover:text-gray-300'
        }`}
      >
        <Calendar size={11} />
        <span className="max-w-[160px] truncate">{label}</span>
        {hasRange && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onChange('', '') }}
            aria-label="Quitar filtro de fechas"
            className="ml-0.5 text-accent-blue/60 hover:text-accent-blue transition-colors"
          >
            <X size={10} />
          </button>
        )}
      </button>

      {/* Popover */}
      {open && (
        <div
          className="absolute top-full mt-2 z-50 left-0 bg-[#0f1117] border border-white/12 rounded-2xl shadow-2xl overflow-hidden animate-date-picker-in"
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
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                    isActive
                      ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                      : 'bg-white/5 text-gray-400 hover:bg-white/8 hover:text-gray-200 border border-transparent'
                  }`}
                >
                  {s.label}
                </button>
              )
            })}
          </div>

          <div className="h-px bg-white/6 mx-3" />

          {/* Navegación mes */}
          <div className="flex items-center justify-between px-3 py-2.5">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="Mes anterior"
              className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/8 transition-all active:scale-90"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-semibold">
              {MONTHS_ES[viewM]} <span className="text-gray-500 font-normal">{viewY}</span>
            </span>
            <button
              type="button"
              onClick={nextMonth}
              aria-label="Mes siguiente"
              className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/8 transition-all active:scale-90"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Grid */}
          <div className="px-3 pb-3">
            {/* Cabecera días */}
            <div className="grid grid-cols-7 mb-1">
              {DAYS_ES.map(d => (
                <div key={d} className="text-center text-[10px] font-medium text-gray-600 py-1">{d}</div>
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
              <p className="text-center text-[10px] text-gray-600 mt-2">
                Desde <span className="text-gray-400">{fmtShort(tmpFrom)}</span> — selecciona fecha de fin
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
