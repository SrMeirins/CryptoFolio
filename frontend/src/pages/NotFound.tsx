import { useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { buttonClasses } from '../components/ui'
import { rutaParecida } from '../utils/rutaParecida'

// Página «no encontrada» (#487): una URL mal escrita o un enlace antiguo ya
// no dejan el contenido en blanco. La ruta pedida se muestra como texto
// literal (React la escapa), nunca como HTML.

const TITULO = 'Página no encontrada'

/** Ruta legible (%20, %3C…); si no se puede decodificar, tal cual. React la pinta como texto. */
function legible(ruta: string): string {
  try { return decodeURIComponent(ruta) } catch { return ruta }
}

export function NotFound() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const sugerencia = rutaParecida(pathname)
  // Sin historial previo en la pestaña, «Volver atrás» no llevaría a ningún sitio.
  const puedeVolver = typeof window !== 'undefined' && window.history.length > 1

  useEffect(() => {
    const anterior = document.title
    document.title = `${TITULO} · CryptoFolio`
    // El lector de pantalla anuncia la página al llegar a ella.
    headingRef.current?.focus()
    return () => { document.title = anterior }
  }, [])

  return (
    <section aria-labelledby="no-encontrada" className="flex flex-col items-center text-center gap-3 px-6 py-16 max-w-xl mx-auto">
      <p aria-hidden="true" className="text-5xl font-extrabold tracking-tight text-brand-ink">404</p>
      <h1 id="no-encontrada" ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-fg focus:outline-hidden">
        Esta página no existe
      </h1>
      <p className="text-sm text-fg-muted break-all">
        No hay nada en <code className="mono text-xs bg-background-tertiary border border-border rounded-md px-1.5 py-0.5">{legible(pathname + search)}</code>.
        Puede que el enlace sea antiguo o tenga una errata.
      </p>
      <div className="flex flex-wrap justify-center gap-2 mt-2">
        <Link to="/" className={buttonClasses('primary', 'md')}>Ir al Dashboard</Link>
        <button type="button" onClick={() => navigate(-1)} disabled={!puedeVolver} className={buttonClasses('secondary', 'md')}>Volver atrás</button>
      </div>
      {sugerencia && (
        <p className="text-sm text-fg-subtle">
          ¿Buscabas <Link to={sugerencia.to} className="text-brand-ink underline rounded-md focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">{sugerencia.label}</Link>?
        </p>
      )}
    </section>
  )
}
