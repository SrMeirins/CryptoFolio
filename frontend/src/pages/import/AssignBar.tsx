import { useState } from 'react'
import { buttonClasses } from '../../components/ui'
import { Casilla } from './Casilla'
import { WithdrawalSelector } from './WithdrawalSelector'

// Asignación masiva unificada (#321): a lo seleccionado o, sin selección, a los pendientes.
export function AssignBar({ coldWallets, seleccion, total, pendientes, onToggleTodo, onAsignar, onLimpiar }: {
  coldWallets: { id: string; name: string; color: string }[]
  seleccion: number
  total: number
  pendientes: number
  onToggleTodo: () => void
  onAsignar: (dest: string) => void
  onLimpiar: () => void
}) {
  const [dest, setDest] = useState('')
  const objetivo = seleccion > 0 ? seleccion : pendientes
  const texto = seleccion > 0 ? `Asignar a ${seleccion} seleccionado${seleccion !== 1 ? 's' : ''}` : `Asignar a ${pendientes} pendiente${pendientes !== 1 ? 's' : ''}`

  return (
    <div className="flex items-center gap-3 flex-wrap rounded-xl border border-border bg-background-tertiary/60 px-4 py-2.5">
      <Casilla estado={seleccion === 0 ? false : seleccion === total ? true : 'mixed'} onChange={onToggleTodo}
        label={seleccion === total ? 'Quitar la selección' : 'Seleccionar todos los retiros'} />
      <span className="text-xs text-fg-muted">Asignar a…</span>
      <WithdrawalSelector value={dest} coldWallets={coldWallets} onChange={setDest} label="Destino para asignar en bloque" placeholder="Elige un destino" />
      <button type="button" disabled={!dest || objetivo === 0} onClick={() => onAsignar(dest)} className={buttonClasses('primary', 'sm')}>{texto}</button>
      {seleccion > 0 && (
        <button type="button" onClick={onLimpiar} className="text-xs text-fg-subtle hover:text-fg">Quitar selección</button>
      )}
    </div>
  )
}
