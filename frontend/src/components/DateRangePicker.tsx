import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react'

interface Props {
  from:     string   // 'YYYY-MM-DD' o ''
  to:       string
  onChange: (from: string, to: string) => void
}

// ── Helpers ────────────────────────────────────────────────────────────────

const DAYS_ES  = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const MONTHS_SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function today(): string { return ymd(new Date()) }
function startOfMonth(d: Date): string { return ymd(new Date(d.getFullYear(), d.getMonth(), 1)) }
function endOfMonth(d: Date): string   { return ymd(new Date(d.getFullYear(), d.getMonth()+1, 0)) }
function startOfYear(d: Date): string  { return `${d.getFullYear()}-01-01` }

function parseDate(s: string): Date | null {
  if (!s) return null
  const d = new Date(s + 'T00:00:00')
  return isNaN(d.getTime()) ? null : d
}

function fmtShort(s: string): string {
  const d = parseDate(s)
  if (!d) return ''
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`
}

function getDaysInGrid(year: number, month: number): (string | null)[] {
  const first    = new Date(year, month, 1)
  const lastDay  = new Date(year, month + 1, 0).getDate()
  // getDay(): 0=Sun → convert to Mon-first: 0→6, 1→0 ... 6→5
  const startDow = (first.getDay() + 6) % 7
  const cells: (string | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= lastDay; d++) {
    cells.push(ymd(new Date(year, month, d)))
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function inRange(d: string, from: string, to: string): boolean {
  if (!from || !to || !d) return false
  const [a, b] = from <= to ? [from, to] : [to, from]
  return d > a && d < b
}

// ── Componente ─────────────────────────────────────────────────────────────

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
  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  // Sincronizar estado interno cuando cambian los props
  useEffect(() => { setTmpFrom(from); setTmpTo(to) }, [from, to])

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
            onClick={e => { e.stopPropagation(); onChange('', '') }}
            className="ml-0.5 text-accent-blue/60 hover:text-accent-blue transition-colors"
          >
            <X size={10} />
          </button>
        )}
      </button>

      {/* Popover */}
      {open && (
        <div
          className="absolute top-full mt-2 z-50 left-0 bg-[#0f1117] border border-white/12 rounded-2xl shadow-2xl overflow-hidden"
          style={{
            minWidth: 280,
            animation: 'datePickerIn 0.18s ease-out both',
          }}
        >
          <style>{`
            @keyframes datePickerIn {
              from { opacity: 0; transform: translateY(-6px) scale(0.97); }
              to   { opacity: 1; transform: translateY(0)    scale(1); }
            }
          `}</style>

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
              onClick={prevMonth}
              className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/8 transition-all active:scale-90"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-semibold">
              {MONTHS_ES[viewM]} <span className="text-gray-500 font-normal">{viewY}</span>
            </span>
            <button
              onClick={nextMonth}
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
              {cells.map((d, i) => {
                if (!d) return <div key={i} />

                const isFrom    = d === previewFrom
                const isTo      = d === previewTo && previewTo !== ''
                const isInRange = inRange(d, previewFrom, previewTo)
                const isToday   = d === todayStr
                const isSingle  = isFrom && isTo

                const isStart   = isFrom && !isSingle
                const isEnd     = isTo   && !isSingle

                return (
                  <button
                    key={d}
                    onClick={() => handleDayClick(d)}
                    onMouseEnter={() => picking === 'to' && setHover(d)}
                    onMouseLeave={() => setHover(null)}
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
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                          isSingle
                            ? 'bg-accent-blue text-white'
                            : 'bg-accent-blue text-white'
                        }`}>
                          {parseInt(d.slice(8))}
                        </span>
                      </span>
                    )}

                    {/* Número del día */}
                    {!isFrom && !isTo && (
                      <span className={`relative z-10 ${isToday ? 'text-accent-blue font-bold' : ''}`}>
                        {parseInt(d.slice(8))}
                      </span>
                    )}

                    {/* Punto "hoy" */}
                    {isToday && !isFrom && !isTo && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent-blue" />
                    )}
                  </button>
                )
              })}
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
