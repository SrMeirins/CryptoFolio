import { useEffect, useRef, type KeyboardEvent } from 'react'
import { optionForKey } from '../../utils/segmented'
import { ESTADO_EJERCICIO_LABEL, estadoEjercicio, type EstadoEjercicio } from '../../utils/fiscalNav'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import type { YearOverview } from './types'

// Selector de ejercicio de la cabecera (#297, #535): chips compactos con el año
// y su estado en texto (en curso, por declarar, declarado), nunca solo color.
// Fila desplazable que centra el año activo; flechas, Inicio y Fin cambian de
// año (patrón tablist). El año en curso lo decide el backend (esAnioEnCurso).

const TONO: Record<EstadoEjercicio, string> = {
  'en-curso': 'text-brand-ink',
  'por-declarar': 'text-warning-ink',
  declarado: 'text-positive-ink',
}

export function YearTabs({ years, activeYear, overview, declarados, onSelect }: {
  years: number[]
  activeYear: number
  overview: YearOverview[]
  /** Ejercicios con la renta marcada como declarada. */
  declarados: ReadonlySet<number>
  onSelect: (year: number) => void
}) {
  const refs = useRef<Record<number, HTMLButtonElement | null>>({})
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    refs.current[activeYear]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [activeYear, reduceMotion])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const next = optionForKey(years, activeYear, e.key)
    if (next === null) return
    e.preventDefault()
    onSelect(next)
    refs.current[next]?.focus()
  }

  return (
    <div className="flex gap-1 overflow-x-auto max-w-full p-0.5 rounded-lg border border-border bg-background-tertiary [scrollbar-width:thin]"
      role="tablist" aria-label="Ejercicio fiscal" onKeyDown={onKeyDown}>
      {years.map(year => {
        const estado = estadoEjercicio(overview.find(o => o.year === year)?.esAnioEnCurso ?? false, declarados.has(year))
        const active = activeYear === year
        return (
          <button key={year} ref={el => { refs.current[year] = el }} type="button" role="tab"
            aria-selected={active} tabIndex={active ? 0 : -1} onClick={() => onSelect(year)}
            className={`shrink-0 flex flex-col items-start px-2.5 py-1 rounded-md text-left transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${
              active ? 'bg-background-card shadow-xs ring-1 ring-brand/40' : 'hover:bg-overlay/5'}`}>
            <span className={`text-sm font-semibold mono leading-tight ${active ? 'text-fg' : 'text-fg-muted'}`}>{year}</span>
            <span className={`text-[10px] font-medium leading-tight ${TONO[estado]}`}>{ESTADO_EJERCICIO_LABEL[estado]}</span>
          </button>
        )
      })}
    </div>
  )
}
