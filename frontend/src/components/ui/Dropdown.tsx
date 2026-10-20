import { Fragment, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { Popover } from './Popover'
import { fieldClasses, type FieldSize } from './classes'
import { edgeEnabled, filterOptions, groupStarts, nextEnabled, typeAhead } from './dropdownNav'

// Desplegable de la app (#240), sustituto de <select>: lista con el estilo de
// la interfaz sobre Popover (no se corta), marca de la opción elegida,
// opciones deshabilitadas, teclado completo (flechas, Inicio/Fin, búsqueda por
// letra, Enter/Escape) y buscador en listas largas. Patrón listbox del WAI-ARIA.

export interface DropdownOption<T extends string | number> {
  value: T
  label: string
  disabled?: boolean
  /** Contenido visual opcional (icono, color…) antes de la etiqueta. */
  prefix?: ReactNode
  /** Texto secundario bajo la etiqueta (#321). */
  description?: string
  /** Grupo de la opción: las consecutivas del mismo grupo van bajo una cabecera (#321). */
  group?: string
}

export interface DropdownProps<T extends string | number> {
  /** Nombre accesible del desplegable. */
  label: string
  value: T
  options: readonly DropdownOption<T>[]
  onChange: (value: T) => void
  size?: FieldSize
  className?: string
  /** Buscador en la lista; por defecto, con más de 10 opciones. */
  searchable?: boolean
  align?: 'start' | 'end'
  disabled?: boolean
  id?: string
  /** Texto del disparador cuando el valor no corresponde a ninguna opción. */
  placeholder?: string
}

const SEARCH_FROM = 10

export function Dropdown<T extends string | number>({
  label, value, options, onChange, size = 'md', className = '', searchable, align = 'start', disabled = false, id, placeholder = '—',
}: DropdownProps<T>) {
  const autoId = useId()
  const baseId = id ?? autoId
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const typed = useRef({ text: '', at: 0 })
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  const withSearch = searchable ?? options.length > SEARCH_FROM
  const visible = useMemo(() => filterOptions(options, query), [options, query])
  const selected = options.find(o => o.value === value)
  const starts = useMemo(() => groupStarts(visible), [visible])

  function openList() {
    if (disabled) return
    const i = visible.findIndex(o => o.value === value)
    setActive(i >= 0 && !visible[i].disabled ? i : edgeEnabled(visible, 'first'))
    setOpen(true)
    // El foco pasa a la lista (o al buscador) cuando el Popover ya está montado.
    requestAnimationFrame(() => (withSearch ? searchRef.current : listRef.current)?.focus())
  }

  function close(focusTrigger = true) {
    setOpen(false)
    setQuery('')
    if (focusTrigger) triggerRef.current?.focus()
  }

  function choose(i: number) {
    const o = visible[i]
    if (!o || o.disabled) return
    onChange(o.value)
    close()
  }

  function onListKey(e: KeyboardEvent) {
    const move = (i: number) => { e.preventDefault(); setActive(i); document.getElementById(`${baseId}-opt-${i}`)?.scrollIntoView({ block: 'nearest' }) }
    switch (e.key) {
      case 'ArrowDown': return move(active < 0 ? edgeEnabled(visible, 'first') : nextEnabled(visible, active, 1))
      case 'ArrowUp': return move(active < 0 ? edgeEnabled(visible, 'last') : nextEnabled(visible, active, -1))
      case 'Home': return move(edgeEnabled(visible, 'first'))
      case 'End': return move(edgeEnabled(visible, 'last'))
      case 'Enter': e.preventDefault(); return choose(active)
      case ' ': if (!withSearch) { e.preventDefault(); return choose(active) } return
      case 'Tab': return close(false)
      default:
        // Búsqueda por letra (sin buscador): acumula lo tecleado durante 600 ms.
        if (!withSearch && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const now = Date.now()
          typed.current = { text: now - typed.current.at < 600 ? typed.current.text + e.key : e.key, at: now }
          move(typeAhead(visible, typed.current.text, typed.current.text.length > 1 ? active - 1 : active))
        }
    }
  }

  function onTriggerKey(e: KeyboardEvent) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList() }
  }

  const listId = `${baseId}-list`
  return (
    <>
      <button
        ref={triggerRef}
        id={baseId}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onTriggerKey}
        className={fieldClasses(size, false, `inline-flex items-center justify-between gap-2 text-left cursor-pointer w-auto ${open ? 'border-brand ring-2 ring-brand/25' : ''} ${className}`)}
      >
        <span className="flex items-center gap-2 min-w-0 truncate">
          {selected?.prefix}
          <span className={`truncate ${selected ? '' : 'text-fg-subtle'}`}>{selected?.label ?? placeholder}</span>
        </span>
        <ChevronDown size={size === 'sm' ? 13 : 15} aria-hidden="true"
          className={`shrink-0 text-fg-subtle transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
      </button>

      <Popover open={open} onClose={() => close(false)} anchorRef={triggerRef} align={align} matchWidth className="p-1">
        {withSearch && (
          <div className="relative p-1 pb-1.5">
            <Search size={13} aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input ref={searchRef} value={query} placeholder="Buscar…" aria-label={`Buscar en ${label}`}
              aria-controls={listId} aria-activedescendant={active >= 0 ? `${baseId}-opt-${active}` : undefined}
              onChange={e => { setQuery(e.target.value); setActive(0) }} onKeyDown={onListKey}
              className={fieldClasses('sm', false, 'pl-8')} />
          </div>
        )}
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          tabIndex={withSearch ? -1 : 0}
          aria-activedescendant={!withSearch && active >= 0 ? `${baseId}-opt-${active}` : undefined}
          onKeyDown={onListKey}
          className="focus:outline-hidden max-h-72 overflow-auto"
        >
          {visible.length === 0 && <p className="px-3 py-2 text-xs text-fg-subtle">Sin resultados</p>}
          {visible.map((o, i) => {
            const isSelected = o.value === value
            return (
              <Fragment key={String(o.value)}>
              {starts.has(i) && (
                <div role="presentation" className="px-2.5 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">{o.group}</div>
              )}
              <div
                id={`${baseId}-opt-${i}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={o.disabled || undefined}
                onMouseEnter={() => !o.disabled && setActive(i)}
                onMouseDown={e => e.preventDefault()}
                onClick={() => choose(i)}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm select-none
                  ${o.disabled ? 'text-fg-subtle/60 cursor-not-allowed' : 'cursor-pointer text-fg'}
                  ${i === active && !o.disabled ? 'bg-brand/12' : ''} ${isSelected ? 'font-medium text-brand' : ''}`}
              >
                {o.prefix}
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{o.label}</span>
                  {o.description && <span className="block text-[11px] font-normal text-fg-subtle whitespace-normal">{o.description}</span>}
                </span>
                {isSelected && <Check size={14} aria-hidden="true" className="text-brand shrink-0" />}
              </div>
              </Fragment>
            )
          })}
        </div>
      </Popover>
    </>
  )
}
