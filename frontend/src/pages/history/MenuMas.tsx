import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArchiveRestore, Keyboard, Link2, MoreHorizontal, Upload } from 'lucide-react'
import { buttonClasses, Popover } from '../../components/ui'

// Menú «Más» de la cabecera del Historial (#552): copiar el enlace de esta
// vista, los atajos de teclado, importar un CSV y restaurar una copia de
// seguridad. Es un desplegable de acciones (botones y enlaces), con Escape y
// clic fuera para cerrar; el foco vuelve al botón.

const ITEM = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-fg hover:bg-overlay/6 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand'

function Item({ icono, children, onClick, to }: { icono: ReactNode; children: ReactNode; onClick?: () => void; to?: string }) {
  return (
    <li>
      {to
        ? <Link to={to} className={ITEM} onClick={onClick}>{icono}{children}</Link>
        : <button type="button" className={ITEM} onClick={onClick}>{icono}{children}</button>}
    </li>
  )
}

export function MenuMas({ onCopiarEnlace, onAtajos }: { onCopiarEnlace: () => void; onAtajos: () => void }) {
  const boton = useRef<HTMLButtonElement>(null)
  const [abierto, setAbierto] = useState(false)
  const cerrarY = (accion?: () => void) => () => { setAbierto(false); accion?.() }
  const ic = (I: typeof Link2) => <I size={14} aria-hidden="true" className="shrink-0 text-fg-subtle" />
  return (
    <>
      <button ref={boton} type="button" onClick={() => setAbierto(a => !a)} aria-haspopup="true" aria-expanded={abierto}
        aria-controls={abierto ? 'historial-menu-mas' : undefined} className={buttonClasses('secondary', 'sm', 'flex gap-1.5')}>
        <MoreHorizontal size={14} aria-hidden="true" /><span className="max-sm:sr-only">Más</span>
      </button>
      <Popover open={abierto} onClose={() => setAbierto(false)} anchorRef={boton} align="end" className="p-1.5 w-64"
        ariaProps={{ role: 'group', 'aria-label': 'Más acciones del Historial' }}>
        <ul id="historial-menu-mas" className="space-y-0.5">
          <Item icono={ic(Link2)} onClick={cerrarY(onCopiarEnlace)}>Copiar el enlace de esta vista</Item>
          <Item icono={ic(Keyboard)} onClick={cerrarY(onAtajos)}>Atajos de teclado</Item>
          <Item icono={ic(Upload)} to="/import" onClick={cerrarY()}>Importar un CSV</Item>
          <Item icono={ic(ArchiveRestore)} to="/settings?tab=datos" onClick={cerrarY()}>Restaurar una copia de seguridad</Item>
        </ul>
      </Popover>
    </>
  )
}
