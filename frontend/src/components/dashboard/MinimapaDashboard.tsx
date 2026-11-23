import { PANEL_INFO } from '../../constants/dashboardPaneles'
import { bloquesMinimapa, type Diseno, type PanelId } from '../../utils/dashboardDiseno'

// Minimapa del Dashboard (#521): el diseño a escala, con las métricas fijas
// arriba y cada panel como un bloque de su color y alto aproximado (solo el
// título, una franja; oculto, no aparece). Los bloques se recolocan con una
// transición al mover, ocultar o contraer. Se describe con una lista para el
// lector de pantalla.

const ESCALA = 9 // px por unidad de alto
const KPI = 26

export function MinimapaDashboard({ diseno, resaltado = null }: { diseno: Diseno; resaltado?: PanelId | null }) {
  const { bloques, total } = bloquesMinimapa(diseno)
  const orden = bloques.map(b => PANEL_INFO[b.id].titulo)
  return (
    <figure className="rounded-2xl border border-border bg-overlay/3 p-3" data-testid="minimapa">
      <figcaption className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-widest text-fg-subtle">
        <span>Vista previa</span>
        <span className="normal-case tracking-normal">{bloques.length} visibles</span>
      </figcaption>
      <p className="sr-only">Orden en la página: {orden.join(', ')}.</p>
      <div aria-hidden="true">
        <div className="grid grid-cols-5 gap-1 mb-1.5" style={{ height: KPI }}>
          {Array.from({ length: 5 }, (_, i) => <span key={i} className="rounded-md bg-overlay/10" />)}
        </div>
        <div className="relative" style={{ height: total * ESCALA }}>
          {bloques.map(b => {
            const { color, icono: Icono } = PANEL_INFO[b.id]
            const activo = resaltado === b.id
            return (
              <div key={b.id} className="absolute transition-[top,left,width,height,box-shadow] duration-300 ease-out"
                style={{ top: b.y * ESCALA, left: `calc(${b.x * 100}% + ${b.x > 0 ? 3 : 0}px)`, width: `calc(${b.ancho * 100}% - ${b.ancho < 1 ? 3 : 0}px)`, height: b.alto * ESCALA }}>
                <div className={`size-full rounded-md border flex items-center gap-1 px-1.5 overflow-hidden ${activo ? 'ring-2 ring-offset-1 ring-offset-background-card' : ''}`}
                  style={{
                    borderColor: `color-mix(in srgb, ${color} ${activo ? 80 : 35}%, transparent)`,
                    backgroundColor: `color-mix(in srgb, ${color} ${b.estado === 'titulo' ? 10 : 18}%, transparent)`,
                    ['--tw-ring-color' as string]: color,
                  }}>
                  {b.alto * ESCALA >= 12 && <Icono size={10} style={{ color }} className="shrink-0" />}
                  {b.alto * ESCALA >= 20 && b.ancho > 0.5 && <span className="truncate text-[9px] font-medium text-fg-muted">{PANEL_INFO[b.id].titulo}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </figure>
  )
}
