import type { ReactNode } from 'react'
import { useDelayedFlag } from '../../hooks/useDelayedFlag'

// Carga unificada (#494). Norma de la base común:
// - Primera carga: esqueleto con la forma final (Skeleton) dentro de
//   SkeletonGroup. Solo se pinta si tarda más de 300 ms; antes, el hueco queda
//   reservado y vacío para que nada salte.
// - Recarga: los datos siguen visibles (placeholderData) y RefreshBar, una
//   barra de 2 px arriba del panel, indica que se actualizan. El panel lleva
//   `relative` y `aria-busy` mientras dura.
// - Acciones: el progreso va dentro del botón (Button con `loading`).
// Sin textos «Cargando…» sueltos ni spinners de panel.

export function SkeletonGroup({ label, children, className = '' }: {
  /** Qué se está cargando, para el lector de pantalla: «Cargando los lotes». */
  label: string
  children: ReactNode
  className?: string
}) {
  const visible = useDelayedFlag(true)
  return (
    <div role="status" aria-label={label} aria-busy="true" data-loading={visible ? 'visible' : 'reservado'}
      className={`${visible ? '' : 'invisible'} ${className}`}>
      {children}
    </div>
  )
}

export function RefreshBar({ active }: { active: boolean }) {
  const visible = useDelayedFlag(active)
  return (
    <div aria-hidden="true" data-refreshing={visible || undefined}
      className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden rounded-t-[inherit]">
      {visible && <span className="refresh-bar block h-full bg-brand" />}
    </div>
  )
}
