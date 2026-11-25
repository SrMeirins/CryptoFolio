import type { ReactNode } from 'react'
import { X } from 'lucide-react'

// Un control de filtro del Historial con su propio botón para quitarlo
// (#552): el valor se ve dentro del control y la X va justo al lado, en el
// mismo grupo visual. Sustituye a los chips duplicados de debajo de la barra.
// La X es un botón hermano (no anidado) con nombre accesible propio.

export function ConQuitar({ activo, nombre, onQuitar, conBoton = true, children }: {
  /** Si el filtro está aplicado: solo entonces se muestra la X y el resalte. */
  activo: boolean
  /** Qué quita, para el nombre accesible: «Quitar el filtro de <nombre>». */
  nombre: string
  onQuitar: () => void
  /** false si el control ya trae su propio botón de quitar (el selector de fechas): solo el resalte. */
  conBoton?: boolean
  children: ReactNode
}) {
  // El envoltorio está siempre: si apareciera al aplicar el filtro, React
  // volvería a montar el control y se cerraría en mitad de la selección.
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-lg ${activo ? `bg-brand/8 ring-1 ring-brand/35 ${conBoton ? 'pr-0.5' : ''}` : ''}`}
      data-filtro-activo={activo ? nombre : undefined}>
      {children}
      {activo && conBoton && (
        <button type="button" onClick={onQuitar} aria-label={`Quitar el filtro de ${nombre}`}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-brand-ink hover:bg-brand/15 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
          <X size={13} aria-hidden="true" />
        </button>
      )}
    </span>
  )
}
