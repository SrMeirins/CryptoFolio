import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, type LucideIcon } from 'lucide-react'

// Celda del resumen de 7 días (#522) con el estilo de las tarjetas de métricas:
// borde degradado y brillo del color de la celda, elevación al pasar o con el
// foco y entrada escalonada. Con `to` u `onSelect`, toda la celda lleva a su
// pantalla (y lo anuncia); sin ellos, el contenido trae sus propios enlaces.
// `grande` es la tarjeta destacada del P&L.

export function CeldaResumen({ etiqueta, icono: Icono, color, to, onSelect, destino, indice, grande = false, className = '', children }: {
  etiqueta: string
  icono: LucideIcon
  /** Color de la celda (variable CSS del tema). */
  color: string
  to?: string
  onSelect?: () => void
  /** Dónde lleva, para el lector de pantalla: «Ir a <destino>». */
  destino?: string
  /** Posición, para la entrada escalonada. */
  indice: number
  grande?: boolean
  className?: string
  children: ReactNode
}) {
  const cuerpo = (
    <>
      <span className="flex items-center gap-2 pr-6">
        <span aria-hidden="true" className={`${grande ? 'size-7' : 'size-6'} shrink-0 rounded-lg flex items-center justify-center`}
          style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}>
          <Icono size={grande ? 14 : 12} style={{ color }} />
        </span>
        <span className={`${grande ? 'text-[11px]' : 'text-[10.5px]'} text-fg-subtle uppercase tracking-widest truncate`}>{etiqueta}</span>
      </span>
      <span className={`${grande ? 'mt-3' : 'mt-2.5'} flex flex-col flex-1 min-w-0`}>{children}</span>
      {(to || onSelect) && (
        <>
          <span aria-hidden="true" className="absolute top-3 right-3 size-6 rounded-full flex items-center justify-center text-fg-subtle bg-overlay/5 transition-colors group-hover:text-fg group-hover:bg-overlay/10">
            <ArrowUpRight size={13} />
          </span>
          {destino && <span className="sr-only">. Ir a {destino}</span>}
        </>
      )}
    </>
  )
  const interior = `group stat-card-body relative flex flex-col justify-start h-full rounded-[15px] ${grande ? 'p-5' : 'p-4'} text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60`
  return (
    <li className={`stat-card stat-card-in relative rounded-2xl p-px min-w-0 ${className}`} style={{ '--card': color, animationDelay: `${indice * 60}ms` } as CSSProperties}
      data-testid="celda-resumen">
      {to ? <Link to={to} className={interior}>{cuerpo}</Link>
        : onSelect ? <button type="button" onClick={onSelect} className={`${interior} w-full`}>{cuerpo}</button>
          : <div className={interior}>{cuerpo}</div>}
    </li>
  )
}
