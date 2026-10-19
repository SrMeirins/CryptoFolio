import { useEffect, useRef, type KeyboardEvent } from 'react'
import { formatEur } from '../../utils/format'
import { optionForKey } from '../../utils/segmented'
import type { YearOverview } from './types'
import { badgeClasses } from '../../components/ui'
import { useReducedMotion } from '../../hooks/useReducedMotion'

// Selector de ejercicio (#297): fila desplazable en pantallas estrechas que
// centra el año activo; flechas, Inicio y Fin cambian de año (patrón tablist).
// El año en curso lo decide el backend en hora de Madrid (esAnioEnCurso).
export function YearTabs({ years, activeYear, overview, onSelect }: {
  years: number[]
  activeYear: number
  overview: YearOverview[]
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
    <div className="flex gap-2 overflow-x-auto sm:flex-wrap pb-1 -mb-1 [scrollbar-width:thin]" role="tablist"
      aria-label="Ejercicio fiscal (← → para cambiar)" onKeyDown={onKeyDown}>
      {years.map(year => {
        const ov   = overview.find(o => o.year === year)
        const neto = ov?.netoPatrimonial ?? 0
        const active = activeYear === year
        return (
          <button
            key={year}
            ref={el => { refs.current[year] = el }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(year)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all shrink-0 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 ${
              active
                ? 'bg-brand/20 border border-brand/40 text-fg'
                : 'bg-background-tertiary border border-border text-fg-muted hover:text-fg hover:border-fg-subtle'
            }`}
          >
            <span>{year}</span>
            {ov?.esAnioEnCurso && (
              <span className={badgeClasses('brand', 'sm')}>EN CURSO</span>
            )}
            {ov && (
              <span className={`text-xs mono font-bold ${neto >= 0 ? 'text-positive' : 'text-negative'}`}>
                {neto >= 0 ? '+' : ''}{formatEur(neto)}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
