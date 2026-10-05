import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

/** Icono de columna ordenable: neutro si no es la columna activa, flecha arriba/abajo según la dirección si lo es. */
export function SortIcon<T extends string>({ col, activeCol, dir, size = 10 }: {
  col: T
  activeCol: T
  dir: 'asc' | 'desc'
  size?: number
}) {
  if (col !== activeCol) return <ArrowUpDown size={size} className="text-gray-600" />
  return dir === 'asc'
    ? <ArrowUp size={size} className="text-accent-blue" />
    : <ArrowDown size={size} className="text-accent-blue" />
}
