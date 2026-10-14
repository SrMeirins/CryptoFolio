import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { optionForKey } from '../../utils/segmented'
import { segmentClasses, type SegmentedSize } from './classes'

// Selector segmentado (#199): elegir un valor entre pocas opciones (moneda,
// tema, periodo, 24h/Total…). Patrón radiogroup del WAI-ARIA: Tab entra en la
// opción activa; flechas, Inicio y Fin cambian de opción.

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  /** Nombre accesible y tooltip; obligatorio si `label` no es texto (iconos). */
  title?: string
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  size?: SegmentedSize
  className?: string
  /** Deshabilita todas las opciones (p. ej. durante una operación en curso). */
  disabled?: boolean
}

export function SegmentedControl<T extends string>({ options, value, onChange, label, size = 'sm', className = '', disabled = false }: SegmentedControlProps<T>) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const values = options.map(o => o.value)

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    const next = optionForKey(values, value, e.key)
    if (next === null) return
    e.preventDefault()
    onChange(next)
    refs.current[next]?.focus()
  }

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown}
      className={`inline-flex shrink-0 items-center gap-0.5 p-0.5 rounded-lg border border-border bg-background-tertiary ${className}`}>
      {options.map(opt => {
        const active = opt.value === value
        return (
          <button key={opt.value} ref={el => { refs.current[opt.value] = el }} type="button" role="radio"
            aria-checked={active} aria-label={opt.title} title={opt.title} tabIndex={active ? 0 : -1} disabled={disabled}
            onClick={() => onChange(opt.value)} className={segmentClasses(active, size)}>
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
