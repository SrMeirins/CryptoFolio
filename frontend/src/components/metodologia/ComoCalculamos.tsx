import { useId, useRef } from 'react'
import { X } from 'lucide-react'
import { Drawer, iconButtonClasses } from '../ui'
import { ContenidoTema } from './ContenidoTema'
import { TEMAS_METODO, temaHeadingId, type TemaMetodo } from './temas'

// Panel «Cómo calculamos» (#493): un cajón lateral con un índice y una sección
// por tema. Se abre en el tema de la pantalla desde la que se pide (el foco va
// a su título) y el índice lleva a los demás. Sin parámetro en la URL.
export function ComoCalculamos({ inicial, onClose }: { inicial: TemaMetodo; onClose: () => void }) {
  const titleId = useId()
  const inicialRef = useRef<HTMLHeadingElement>(null)

  const ir = (tema: TemaMetodo) => {
    const h = document.getElementById(temaHeadingId(tema))
    h?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    h?.focus({ preventScroll: true })
  }

  return (
    <Drawer onClose={onClose} labelledBy={titleId} initialFocusRef={inicialRef}>
      <div className="flex items-start gap-3 px-5 py-4 border-b border-border">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-lg font-semibold text-fg leading-tight">Cómo calculamos</h2>
          <p className="mt-0.5 text-xs text-fg-muted">Información orientativa: no sustituye a un asesor fiscal.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar «Cómo calculamos»" className={iconButtonClasses('md')}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
        <nav aria-label="Temas">
          <ul className="flex flex-wrap gap-1.5">
            {TEMAS_METODO.map(t => (
              <li key={t.id}>
                <button type="button" onClick={() => ir(t.id)}
                  className="text-xs px-2.5 py-1 rounded-full border border-border text-fg-muted hover:text-fg hover:border-fg-subtle focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
                  {t.titulo}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        {TEMAS_METODO.map(t => (
          <section key={t.id} aria-labelledby={temaHeadingId(t.id)} className="space-y-2 text-sm text-fg-muted leading-relaxed scroll-mt-4">
            <h3 id={temaHeadingId(t.id)} ref={t.id === inicial ? inicialRef : undefined} tabIndex={-1}
              className="text-base font-semibold text-fg scroll-mt-4 rounded focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
              {t.titulo}
            </h3>
            <ContenidoTema tema={t.id} />
          </section>
        ))}
      </div>
    </Drawer>
  )
}
