import { COLUMNAS, type ColumnKey } from '../utils/portfolioColumns'
import { MultiDropdown } from './ui'

const OPCIONES = COLUMNAS.map(c => ({ value: c.key, label: c.label }))

/** Selector de columnas de la tabla de posiciones (#527), en Portfolio y en Ajustes. */
export function ColumnasSelector({ values, onChange, className, align = 'end' }: {
  values: readonly ColumnKey[]
  onChange: (cols: ColumnKey[]) => void
  className?: string
  align?: 'start' | 'end'
}) {
  return (
    <MultiDropdown label="Columnas de la tabla" placeholder="Solo activo y valor" plural="columnas" searchable={false}
      values={values} options={OPCIONES} align={align} className={className}
      onChange={v => onChange(COLUMNAS.map(c => c.key).filter(k => v.includes(k)))} />
  )
}
