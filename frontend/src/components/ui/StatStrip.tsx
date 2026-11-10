import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react'
import { AnimatedNumber } from '../AnimatedNumber'
import { cellActionLabel } from './statStripLogic'

// Tira de métricas común (#490). Norma de la base común:
// - StatCard (tres huecos) solo para los KPI principales de Dashboard e Historial.
// - StatStrip para todas las demás métricas secundarias: una tira opaca de 2 a
//   6 celdas con separadores, en lugar de mini tarjetas sueltas.
// Cada celda lleva su etiqueta, la cifra y, si hace falta, una línea
// secundaria. El tono nunca va solo en el color: se acompaña de un icono y de
// un texto para el lector de pantalla. Una celda pulsable muestra su destino
// (subrayado del color al pasar y al enfocar) y lo anuncia: «Ver X en Y».
// En pantallas estrechas pasa a dos columnas sin desbordar.

export type StatTone = 'positive' | 'negative' | 'warning'

export interface StatStripCell {
  key: string
  label: string
  /** Un número cuenta hasta su valor con `format`; cualquier otro contenido se muestra tal cual. */
  value: number | ReactNode
  format?: (v: number) => string
  /** Línea secundaria bajo la cifra (contexto, recuento, fecha). */
  sub?: ReactNode
  tone?: StatTone
  /** Destino de la celda: una ruta interna o una acción. */
  to?: string
  onSelect?: () => void
  /** Dónde lleva, para el nombre accesible «Ver <label> en <destination>». */
  destination?: string
}

const TONES: Record<StatTone, { text: string; line: string; icon: LucideIcon; sr: string }> = {
  positive: { text: 'text-positive', line: 'bg-positive', icon: TrendingUp, sr: 'positivo' },
  negative: { text: 'text-negative', line: 'bg-negative', icon: TrendingDown, sr: 'negativo' },
  warning: { text: 'text-warning-ink', line: 'bg-warning', icon: AlertTriangle, sr: 'requiere atención' },
}

// Clases completas (Tailwind no admite clases construidas en tiempo de ejecución).
const COLS: Record<number, string> = {
  2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4', 5: 'sm:grid-cols-5', 6: 'sm:grid-cols-6',
}

function CellBody({ cell }: { cell: StatStripCell }) {
  const tone = cell.tone ? TONES[cell.tone] : null
  const ToneIcon = tone?.icon
  const value = typeof cell.value === 'number' && cell.format
    ? <AnimatedNumber value={cell.value} format={cell.format} duration={400} />
    : cell.value
  return (
    <>
      <span className="block text-[10.5px] text-fg-subtle uppercase tracking-widest truncate">{cell.label}</span>
      <span className={`mt-1 flex items-center gap-1.5 text-[15px] font-bold mono tabular-nums min-w-0 ${tone?.text ?? 'text-fg'}`}>
        {ToneIcon && <ToneIcon size={13} aria-hidden="true" className="shrink-0" />}
        <span className="truncate">{value}</span>
        {tone && <span className="sr-only">({tone.sr})</span>}
      </span>
      {cell.sub && <span className="block mt-0.5 text-[11px] text-fg-muted truncate">{cell.sub}</span>}
    </>
  )
}

export function StatStrip({ cells, label, columnas, className = '' }: {
  cells: readonly StatStripCell[]
  /** Nombre del grupo para el lector de pantalla. */
  label: string
  /** Columnas fijas en lugar de una por celda, p. ej. 2 en un panel estrecho (#539). */
  columnas?: 2 | 3 | 4 | 5 | 6
  className?: string
}) {
  const n = columnas ?? Math.min(6, Math.max(2, cells.length))
  return (
    // gap-px sobre el color del borde: los separadores salen en cualquier disposición de la rejilla.
    <ul aria-label={label}
      className={`grid grid-cols-2 ${COLS[n]} gap-px rounded-xl overflow-hidden border border-border bg-border ${className}`}>
      {cells.map(cell => {
        const tone = cell.tone ? TONES[cell.tone] : null
        const pulsable = Boolean(cell.to || cell.onSelect)
        const cls = `group relative block h-full min-w-0 px-3.5 py-2.5 bg-background-card text-left
          ${pulsable ? 'transition-colors hover:bg-background-tertiary focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand' : ''}`
        // Subrayado del color de la celda al pasar o enfocar: indica que lleva a algún sitio.
        const underline = pulsable && (
          <span aria-hidden="true" className={`absolute left-3 right-3 bottom-1 h-0.5 rounded-full opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${tone?.line ?? 'bg-brand'}`} />
        )
        return (
          <li key={cell.key} className="min-w-0">
            {cell.to ? (
              <Link to={cell.to} aria-label={cellActionLabel(cell)} className={cls}><CellBody cell={cell} />{underline}</Link>
            ) : cell.onSelect ? (
              <button type="button" onClick={cell.onSelect} aria-label={cellActionLabel(cell)} className={`w-full ${cls}`}><CellBody cell={cell} />{underline}</button>
            ) : (
              <div className={cls}><CellBody cell={cell} /></div>
            )}
          </li>
        )
      })}
      {/* Rellena el hueco de la rejilla de dos columnas con un número impar de celdas. */}
      {cells.length % 2 === 1 && <li aria-hidden="true" className="bg-background-card sm:hidden" />}
    </ul>
  )
}
