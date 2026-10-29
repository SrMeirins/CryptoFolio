import { useId } from 'react'
import { Modal, ModalHeader } from '../../../components/ui'

// Ayuda de atajos del Historial (#382): diálogo accesible; Esc lo cierra y el
// foco vuelve al elemento que lo abrió (useModalA11y).

const SHORTCUTS: readonly [string[], string][] = [
  [['/'], 'Ir a la búsqueda'],
  [['Flecha izquierda', 'Flecha derecha'], 'Año anterior o siguiente; con el detalle abierto, transacción anterior o siguiente'],
  [['Flecha arriba', 'Flecha abajo'], 'Moverse entre filas de la tabla'],
  [['Inicio', 'Fin'], 'Primera o última fila de la página'],
  [['Intro'], 'Abrir el detalle de la fila'],
  [['Esc'], 'Cerrar el detalle o este diálogo'],
  [['?'], 'Mostrar esta ayuda'],
]

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const titleId = useId()
  return (
    <Modal onClose={onClose} labelledBy={titleId} size="md">
      <ModalHeader titleId={titleId} title="Atajos de teclado" onClose={onClose} />
      <dl className="px-6 py-4 grid grid-cols-[minmax(0,14rem)_1fr] gap-x-5 gap-y-2.5 text-sm">
        {SHORTCUTS.map(([keys, what]) => (
          <div key={what} className="contents">
            <dt className="flex flex-wrap items-center gap-1">
              {keys.map((k, i) => (
                <span key={k}>
                  <kbd className="rounded-md border border-border bg-background-tertiary px-1.5 py-0.5 text-xs mono text-fg">{k}</kbd>
                  {i < keys.length - 1 && <span className="text-fg-subtle text-xs"> o </span>}
                </span>
              ))}
            </dt>
            <dd className="text-fg-muted">{what}</dd>
          </div>
        ))}
      </dl>
      <p className="px-6 pb-4 text-xs text-fg-subtle">No actúan mientras escribes en un campo.</p>
    </Modal>
  )
}
