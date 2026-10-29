import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown, Minus, Search } from 'lucide-react'
import { Popover } from './Popover'
import { fieldClasses, type FieldSize } from './classes'
import { filterOptions } from './dropdownNav'
import { buildRows, groupState, summaryLabel, toggleGroup, toggleValue, type MultiOption } from './multiSelectLogic'

// Desplegable de selección múltiple (#366), variante del Dropdown (#240):
// casillas, buscador, cabeceras de grupo que marcan el grupo entero y
// «N seleccionados» en el disparador. Patrón listbox del WAI-ARIA con
// aria-multiselectable: Enter o Espacio marcan la opción activa sin cerrar.

export interface MultiDropdownProps<T extends string> {
  /** Nombre accesible del desplegable. */
  label: string
  values: readonly T[]
  options: readonly MultiOption<T>[]
  onChange: (values: T[]) => void
  /** Texto del disparador sin nada marcado (p. ej. «Todos los tipos»). */
  placeholder: string
  size?: FieldSize
  className?: string
  /** Buscador en la lista; por defecto, con más de 10 opciones. */
  searchable?: boolean
  /** Las cabeceras de grupo marcan o desmarcan todas sus opciones. */
  groupSelectable?: boolean
  /** Sustantivo del recuento en el disparador («tipos» → «3 tipos»). */
  plural?: string
  align?: 'start' | 'end'
}

const SEARCH_FROM = 10

function Box({ state }: { state: 'all' | 'some' | 'none' }) {
  return (
    <span aria-hidden="true" className={`size-4 shrink-0 rounded border grid place-items-center ${state === 'none' ? 'border-border' : 'border-brand bg-brand text-on-brand'}`}>
      {state === 'all' && <Check size={11} strokeWidth={3} />}
      {state === 'some' && <Minus size={11} strokeWidth={3} />}
    </span>
  )
}

export function MultiDropdown<T extends string>({
  label, values, options, onChange, placeholder, size = 'md', className = '', searchable, groupSelectable = false, align = 'start', plural,
}: MultiDropdownProps<T>) {
  const baseId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const withSearch = searchable ?? options.length > SEARCH_FROM
  const visible = useMemo(() => filterOptions(options, query), [options, query])
  // Con búsqueda, las cabeceras de grupo no se ofrecen: marcarían opciones ocultas.
  const rows = useMemo(() => buildRows(visible, groupSelectable && !query.trim()), [visible, groupSelectable, query])

  function openList() {
    setActive(0)
    setOpen(true)
    requestAnimationFrame(() => (withSearch ? searchRef.current : listRef.current)?.focus())
  }

  function close(focusTrigger = true) {
    setOpen(false)
    setQuery('')
    if (focusTrigger) triggerRef.current?.focus()
  }

  function toggle(i: number) {
    const row = rows[i]
    if (!row) return
    onChange(row.kind === 'group' ? toggleGroup(values, options, row.group) : toggleValue(values, row.option.value))
  }

  function onListKey(e: KeyboardEvent) {
    const move = (i: number) => {
      e.preventDefault()
      const next = Math.max(0, Math.min(rows.length - 1, i))
      setActive(next)
      document.getElementById(`${baseId}-opt-${next}`)?.scrollIntoView({ block: 'nearest' })
    }
    switch (e.key) {
      case 'ArrowDown': return move(active + 1)
      case 'ArrowUp': return move(active - 1)
      case 'Home': return move(0)
      case 'End': return move(rows.length - 1)
      case 'Enter': e.preventDefault(); return toggle(active)
      case ' ': if (!withSearch) { e.preventDefault(); return toggle(active) } return
      case 'Escape': e.preventDefault(); return close()
      case 'Tab': return close(false)
    }
  }

  function onTriggerKey(e: KeyboardEvent) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList() }
  }

  const listId = `${baseId}-list`
  const summary = summaryLabel(values, options, placeholder, plural)
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${label}: ${summary}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onTriggerKey}
        className={fieldClasses(size, false, `inline-flex items-center justify-between gap-2 text-left cursor-pointer w-auto ${open ? 'border-brand ring-2 ring-brand/25' : ''} ${className}`)}
      >
        <span className={`truncate ${values.length ? '' : 'text-fg-subtle'}`}>{summary}</span>
        <ChevronDown size={size === 'sm' ? 13 : 15} aria-hidden="true"
          className={`shrink-0 text-fg-subtle transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
      </button>

      <Popover open={open} onClose={() => close(false)} anchorRef={triggerRef} align={align} className="p-1 min-w-56">
        {withSearch && (
          <div className="relative p-1 pb-1.5">
            <Search size={13} aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input ref={searchRef} value={query} placeholder="Buscar…" aria-label={`Buscar en ${label}`}
              aria-controls={listId} aria-activedescendant={rows.length ? `${baseId}-opt-${active}` : undefined}
              onChange={e => { setQuery(e.target.value); setActive(0) }} onKeyDown={onListKey}
              className={fieldClasses('sm', false, 'pl-8')} />
          </div>
        )}
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          aria-multiselectable="true"
          tabIndex={withSearch ? -1 : 0}
          aria-activedescendant={!withSearch && rows.length ? `${baseId}-opt-${active}` : undefined}
          onKeyDown={onListKey}
          className="focus:outline-hidden max-h-72 overflow-auto"
        >
          {rows.length === 0 && <p className="px-3 py-2 text-xs text-fg-subtle">Sin resultados</p>}
          {rows.map((row, i) => {
            const state = row.kind === 'group' ? groupState(values, options, row.group) : values.includes(row.option.value) ? 'all' : 'none'
            return (
              <div
                key={row.kind === 'group' ? `g:${row.group}` : String(row.option.value)}
                id={`${baseId}-opt-${i}`}
                role="option"
                aria-selected={state === 'all'}
                onMouseEnter={() => setActive(i)}
                onMouseDown={e => e.preventDefault()}
                onClick={() => toggle(i)}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm select-none cursor-pointer text-fg
                  ${i === active ? 'bg-brand/12' : ''} ${row.kind === 'group' ? 'mt-1 text-[11px] font-semibold uppercase tracking-wider text-fg-muted' : ''}`}
              >
                <Box state={state} />
                <span className="flex-1 min-w-0 truncate">{row.kind === 'group' ? row.label : row.option.label}</span>
              </div>
            )
          })}
        </div>
        {values.length > 0 && (
          <div className="border-t border-border mt-1 pt-1 px-1">
            <button type="button" onClick={() => onChange([])}
              className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-fg-muted hover:text-fg hover:bg-overlay/6 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
              Quitar selección ({values.length})
            </button>
          </div>
        )}
      </Popover>
    </>
  )
}
