import { useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Popover } from './Popover'
import { fieldClasses, iconButtonClasses, type FieldSize } from './classes'
import { monthGridMove, outOfRange, yearsBetween, type YM } from './monthPickerLogic'

// Selector de mes y año (#240): un botón «Octubre 2026 ▾» que abre los 12
// meses en rejilla con flechas para cambiar de año (o, en modo año, los años
// disponibles). Los meses fuera de [min, max] aparecen deshabilitados.

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function MonthPicker({ value, onChange, min, max, mode = 'month', size = 'sm', label = 'Elegir mes' }: {
  value: YM
  onChange: (ym: YM) => void
  min: YM
  max: YM
  /** `year`: solo se elige el año (vista anual del calendario). */
  mode?: 'month' | 'year'
  size?: FieldSize
  label?: string
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(value.year)

  function openPicker() {
    setViewYear(value.year)
    setOpen(true)
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>('[aria-current="true"], button:not([disabled])')?.focus())
  }
  function pick(ym: YM) {
    onChange(ym)
    setOpen(false)
    triggerRef.current?.focus()
  }
  function onGridKey(e: KeyboardEvent<HTMLDivElement>) {
    const current = Number((document.activeElement as HTMLElement | null)?.dataset.month)
    if (!current) return
    const next = monthGridMove(current, e.key)
    if (next === null) return
    e.preventDefault()
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-month="${next}"]`)?.focus()
  }

  const text = mode === 'year' ? String(value.year) : `${cap(MONTHS[value.month - 1])} ${value.year}`
  return (
    <>
      <button ref={triggerRef} type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={`${label}: ${text}`}
        onClick={() => (open ? setOpen(false) : openPicker())}
        className={fieldClasses(size, false, `inline-flex items-center gap-2 w-auto cursor-pointer font-medium ${open ? 'border-brand ring-2 ring-brand/25' : ''}`)}>
        {text}
        <ChevronDown size={13} aria-hidden="true" className={`text-fg-subtle transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
      </button>

      <Popover open={open} onClose={() => setOpen(false)} anchorRef={triggerRef} align="end" className="p-3 w-64"
        ariaProps={{ role: 'dialog', 'aria-label': label }}>
        {mode === 'month' ? (
          <>
            <div className="flex items-center justify-between mb-2">
              <button type="button" aria-label="Año anterior" disabled={viewYear <= min.year} onClick={() => setViewYear(y => y - 1)} className={iconButtonClasses('sm')}>
                <ChevronLeft size={15} />
              </button>
              <span className="text-sm font-semibold text-fg mono" aria-live="polite">{viewYear}</span>
              <button type="button" aria-label="Año siguiente" disabled={viewYear >= max.year} onClick={() => setViewYear(y => y + 1)} className={iconButtonClasses('sm')}>
                <ChevronRight size={15} />
              </button>
            </div>
            <div ref={gridRef} className="grid grid-cols-4 gap-1" onKeyDown={onGridKey}>
              {MONTHS.map((name, i) => {
                const ym = { year: viewYear, month: i + 1 }
                const selected = value.year === viewYear && value.month === i + 1
                const disabled = outOfRange(ym, min, max)
                return (
                  <button key={name} type="button" data-month={i + 1} disabled={disabled} aria-current={selected || undefined}
                    aria-label={`${cap(name)} de ${viewYear}`} onClick={() => pick(ym)}
                    className={`py-2 rounded-lg text-xs font-medium capitalize transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand
                      disabled:opacity-35 disabled:cursor-not-allowed
                      ${selected ? 'bg-brand-solid text-on-brand' : 'text-fg-muted enabled:hover:bg-brand/12 enabled:hover:text-fg'}`}>
                    {name.slice(0, 3)}
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          <div ref={gridRef} className="grid grid-cols-3 gap-1">
            {yearsBetween(min, max).map(y => (
              <button key={y} type="button" aria-current={y === value.year || undefined} onClick={() => pick({ year: y, month: value.month })}
                className={`py-2 rounded-lg text-xs font-medium mono transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand
                  ${y === value.year ? 'bg-brand-solid text-on-brand' : 'text-fg-muted hover:bg-brand/12 hover:text-fg'}`}>
                {y}
              </button>
            ))}
          </div>
        )}
      </Popover>
    </>
  )
}
