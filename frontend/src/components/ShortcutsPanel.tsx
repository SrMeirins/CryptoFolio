import { useId } from 'react'
import { useLocation } from 'react-router-dom'
import { Modal, ModalHeader } from './ui'
import { atajosDe } from '../constants/shortcuts'
import { useShortcutsStore } from '../store/shortcutsStore'

// Panel de atajos de teclado (#535): los de la pantalla actual y los generales,
// en un diálogo accesible. Sustituye a los globos «Atajo» al pasar el ratón.

export function ShortcutsPanel() {
  const { open, setOpen } = useShortcutsStore()
  const { pathname } = useLocation()
  const titleId = useId()
  if (!open) return null
  const close = () => setOpen(false)
  return (
    <Modal onClose={close} labelledBy={titleId} size="md">
      <ModalHeader titleId={titleId} title="Atajos de teclado" onClose={close} />
      <div className="px-6 py-4 space-y-5">
        {atajosDe(pathname).map(g => (
          <section key={g.titulo} aria-labelledby={`${titleId}-${g.titulo}`}>
            <h3 id={`${titleId}-${g.titulo}`} className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle mb-2">{g.titulo}</h3>
            <dl className="grid grid-cols-[minmax(0,14rem)_1fr] gap-x-5 gap-y-2.5 text-sm">
              {g.atajos.map(([teclas, que]) => (
                <div key={que} className="contents">
                  <dt className="flex flex-wrap items-center gap-1">
                    {teclas.map((k, i) => (
                      <span key={k}>
                        <kbd className="rounded-md border border-border bg-background-tertiary px-1.5 py-0.5 text-xs mono text-fg">{k}</kbd>
                        {i < teclas.length - 1 && <span className="text-fg-subtle text-xs"> o </span>}
                      </span>
                    ))}
                  </dt>
                  <dd className="text-fg-muted">{que}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="px-6 pb-4 text-xs text-fg-subtle">No actúan mientras escribes en un campo.</p>
    </Modal>
  )
}
