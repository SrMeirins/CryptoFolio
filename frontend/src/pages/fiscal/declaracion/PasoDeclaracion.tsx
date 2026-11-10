import type { ReactNode } from 'react'
import { AlertTriangle, Check, Minus } from 'lucide-react'
import type { EstadoPaso, Paso } from '../../../utils/pasosDeclaracion'

// Un paso del stepper de la declaración (#542): círculo de estado unido al
// siguiente por un conector, título, chip de estado, detalle y acciones. El
// estado va siempre también en texto (chip y nombre accesible del título).

const ESTADO: Record<EstadoPaso, { circulo: string; chip: string; chipTexto: string; sr: string }> = {
  hecho: { circulo: 'bg-positive text-on-positive shadow-sm', chip: 'bg-positive/12 text-positive-ink', chipTexto: 'Hecho', sr: 'hecho' },
  cambiado: { circulo: 'bg-warning text-on-warning shadow-sm', chip: 'bg-warning/15 text-warning-ink', chipTexto: 'Cifras cambiadas', sr: 'hecho, pero las cifras han cambiado' },
  pendiente: { circulo: 'bg-background-card text-fg-muted ring-2 ring-inset ring-border', chip: 'bg-overlay/8 text-fg-muted', chipTexto: 'Pendiente', sr: 'pendiente' },
  'no-aplica': { circulo: 'bg-background-card text-positive-ink border-2 border-dashed border-positive/50', chip: 'bg-positive/10 text-positive-ink', chipTexto: 'No hace falta presentarlo', sr: 'no hace falta presentarlo' },
}

/** Tramo del conector hacia el paso siguiente: lleno si este está hecho, punteado si el siguiente no aplica. */
export type Conector = 'lleno' | 'vacio' | 'punteado' | null

export function PasoDeclaracion({ n, paso, actual, conector, detalle, acciones }: {
  n: number
  paso: Paso
  /** Primer paso pendiente: se destaca como el siguiente que hay que dar. */
  actual: boolean
  conector: Conector
  detalle: ReactNode
  acciones?: ReactNode
}) {
  const e = ESTADO[paso.estado]
  return (
    <li className="relative flex flex-col gap-2.5 min-w-0">
      {/* Conector hacia el siguiente: del borde de este círculo al del siguiente, solo en una fila. */}
      {conector && (
        <span aria-hidden="true" className={`hidden xl:block absolute top-[18px] left-[calc(2.25rem+0.75rem)] right-[-0.25rem] ${
          conector === 'punteado' ? 'border-t-2 border-dashed border-positive/40' : `h-0.5 rounded-full ${conector === 'lleno' ? 'bg-positive/70' : 'bg-border'}`}`} />
      )}
      <span aria-hidden="true" className={`relative z-[1] inline-flex size-9 items-center justify-center rounded-full text-sm font-bold ${actual ? 'bg-background-card text-brand-ink ring-2 ring-inset ring-brand outline-4 outline-brand/20' : e.circulo}`}>
        {paso.estado === 'hecho' ? <Check size={17} strokeWidth={3} />
          : paso.estado === 'cambiado' ? <AlertTriangle size={15} strokeWidth={2.5} />
          : paso.estado === 'no-aplica' ? <Minus size={16} strokeWidth={2.5} /> : n}
      </span>
      <div className="space-y-1.5 min-w-0">
        <h3 className="text-sm font-semibold text-fg" aria-label={`${paso.titulo}: ${e.sr}`}>{paso.titulo}</h3>
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${e.chip}`} aria-hidden="true">{e.chipTexto}</span>
      </div>
      <div className="text-xs text-fg-muted leading-relaxed">{detalle}</div>
      {acciones && <div className="flex flex-wrap items-center gap-2 mt-auto pt-1">{acciones}</div>}
    </li>
  )
}
