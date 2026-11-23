import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { LayoutDashboard, RotateCcw, Undo2 } from 'lucide-react'
import { Button, panelClasses } from '../../components/ui'
import { EditorDiseno } from '../../components/dashboard/EditorDiseno'
import { MinimapaDashboard } from '../../components/dashboard/MinimapaDashboard'
import { DISENO_DEFECTO, esPorDefecto, serializarDiseno, type Diseno, type PanelId } from '../../utils/dashboardDiseno'

// Modo Personalizar del Dashboard (#521): barra fija con las acciones, la
// lista de paneles como tarjetas y, al lado, el minimapa del Dashboard que se
// actualiza en vivo (resalta el panel bajo el puntero o arrastrado). Cada
// cambio se guarda al momento; «Deshacer cambios» vuelve al diseño con el que
// se entró, «Restaurar» al de por defecto (con Deshacer en el aviso) y «Listo»
// sale. Al entrar, el foco va al título del modo.

export function ModoPersonalizar({ diseno, onCambiar, onRestaurar, onListo }: {
  diseno: Diseno
  onCambiar: (d: Diseno) => Promise<void> | void
  onRestaurar: (d: Diseno) => void
  onListo: () => void
}) {
  const [inicial] = useState(diseno)
  const [resaltado, setResaltado] = useState<PanelId | null>(null)
  const [vivo, setVivo] = useState<PanelId[] | null>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  useEffect(() => { titulo.current?.focus() }, [])
  const cambiado = serializarDiseno(diseno) !== serializarDiseno(inicial)

  return (
    <section aria-labelledby="personalizar-titulo" className={panelClasses('space-y-4')} data-testid="modo-personalizar">
      <div className="sticky top-0 z-30 -mx-2 px-2 py-2 bg-background/85 backdrop-blur-md">
        <div className="stat-card relative rounded-2xl p-px" style={{ '--card': 'var(--cf-brand)' } as CSSProperties}>
          <div className="stat-card-body rounded-[15px] flex items-center justify-between gap-3 flex-wrap px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <span aria-hidden="true" className="size-9 shrink-0 rounded-xl flex items-center justify-center bg-brand/15 text-brand-ink">
                <LayoutDashboard size={18} />
              </span>
              <div className="min-w-0">
                <h2 id="personalizar-titulo" ref={titulo} tabIndex={-1} className="text-sm font-semibold text-fg focus:outline-hidden">Personalizar el Dashboard</h2>
                <p className="text-xs text-fg-subtle">Arrastra por el asa o usa las flechas. Se guarda al momento; las métricas de arriba son fijas.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="ghost" icon={<Undo2 size={14} aria-hidden="true" />} disabled={!cambiado} onClick={() => void onCambiar(inicial)}>Deshacer cambios</Button>
              <Button size="sm" variant="ghost" icon={<RotateCcw size={14} aria-hidden="true" />} disabled={esPorDefecto(diseno)} onClick={() => onRestaurar(DISENO_DEFECTO)}>
                Restaurar diseño por defecto
              </Button>
              <Button size="sm" variant="primary" onClick={onListo}>Listo</Button>
            </div>
          </div>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_15rem] items-start">
        <EditorDiseno diseno={diseno} onCambiar={onCambiar} onResaltar={setResaltado} onOrdenVivo={setVivo} />
        <div className="hidden lg:block sticky top-28">
          <MinimapaDashboard diseno={vivo ? { ...diseno, orden: vivo } : diseno} resaltado={resaltado} />
        </div>
      </div>
    </section>
  )
}
