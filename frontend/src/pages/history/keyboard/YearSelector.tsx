import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Dropdown, iconButtonClasses, Hint } from '../../../components/ui'

/**
 * Selector «Año» del Historial (#382): todos los años o uno con transacciones,
 * con botones de año anterior y siguiente (también con las flechas del teclado).
 */
export function YearSelector({ years, value, onChange, onStep, canPrev, canNext }: {
  /** Años con transacciones, ascendentes. */
  years: readonly number[]
  value: number | null
  onChange: (year: number | null) => void
  onStep: (step: -1 | 1) => void
  canPrev: boolean
  canNext: boolean
}) {
  if (years.length === 0) return null
  return (
    <div className="flex items-center gap-0.5">
      <Hint label="Año anterior (flecha izquierda)">
        <button type="button" onClick={() => onStep(-1)} disabled={!canPrev} aria-label="Año anterior" aria-keyshortcuts="ArrowLeft"
  className={iconButtonClasses('md')}>
          <ChevronLeft size={14} aria-hidden="true" />
        </button>
      </Hint>
      <Dropdown size="sm" label="Filtrar por año" value={value === null ? '' : String(value)}
        onChange={v => onChange(v ? Number(v) : null)}
        options={[{ value: '', label: 'Todos los años' }, ...[...years].reverse().map(y => ({ value: String(y), label: String(y) }))]} />
      <Hint label="Año siguiente (flecha derecha)">
        <button type="button" onClick={() => onStep(1)} disabled={!canNext} aria-label="Año siguiente" aria-keyshortcuts="ArrowRight"
  className={iconButtonClasses('md')}>
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </Hint>
    </div>
  )
}
