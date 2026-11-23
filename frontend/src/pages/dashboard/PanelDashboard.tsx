import type { CSSProperties, ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { panelClasses, panelSurface } from '../../components/ui'
import { PANEL_INFO } from '../../constants/dashboardPaneles'
import type { PanelId } from '../../utils/dashboardDiseno'

// Un panel del Dashboard personalizable (#521). Contraído, una barra con su
// icono y nombre que lo vuelve a abrir (sin montar el panel: no pide datos).
// Abierto, el panel con una píldora «Minimizar» en su borde superior, que
// aparece al pasar el cursor o con el foco y siempre en pantallas táctiles.

export function BarraContraida({ id, onExpandir, className = '' }: { id: PanelId; onExpandir: () => void; className?: string }) {
  const { titulo, icono: Icono } = PANEL_INFO[id]
  return (
    <div className={panelClasses(`${panelSurface('none')} ${className}`)} data-testid="panel-contraido" data-panel={id}>
      <button type="button" onClick={onExpandir} aria-expanded={false}
        className="group w-full flex items-center gap-2 rounded-xl px-5 py-3 text-left hover:bg-overlay/3 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60">
        <span aria-hidden="true" className="w-6 h-6 shrink-0 rounded-md flex items-center justify-center text-brand-ink bg-brand/10">
          <Icono size={13} strokeWidth={2.3} />
        </span>
        <span className="flex-1 text-[11px] text-fg-muted font-semibold uppercase tracking-widest">{titulo}</span>
        <span className="text-xs text-fg-subtle group-hover:text-fg-muted">Mostrar completo</span>
        <ChevronDown size={15} aria-hidden="true" className="text-fg-subtle group-hover:text-fg-muted" />
      </button>
    </div>
  )
}

/**
 * Botón para dejar un panel abierto solo con su título. `flotante` lo coloca
 * en la esquina del panel como una píldora «Minimizar».
 */
export function BotonContraer({ id, onContraer, flotante = true }: { id: PanelId; onContraer: () => void; flotante?: boolean }) {
  return (
    <button type="button" onClick={onContraer} aria-expanded={true} aria-label={`Minimizar ${PANEL_INFO[id].titulo}`}
      className={`inline-flex items-center gap-1 rounded-full border border-border bg-background-card px-2 h-6 text-[11px] font-medium text-fg-muted shadow-sm transition-opacity hover:text-fg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 ${flotante
        ? 'absolute -top-3 right-4 z-20 opacity-0 group-hover/panel:opacity-100 group-focus-within/panel:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100'
        : ''}`}>
      <ChevronUp size={13} aria-hidden="true" />Minimizar
    </button>
  )
}

/** Panel abierto con su botón de contraer en la esquina. */
export function PanelAbierto({ id, onContraer, className = '', style, children }: {
  id: PanelId
  onContraer: () => void
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <div className={`relative group/panel min-w-0 ${className}`} style={style} data-panel={id}>
      {children}
      <BotonContraer id={id} onContraer={onContraer} />
    </div>
  )
}
