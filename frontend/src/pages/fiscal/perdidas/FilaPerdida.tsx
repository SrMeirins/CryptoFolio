import { forwardRef, useId, useState } from 'react'
import { ChevronDown, Hourglass } from 'lucide-react'
import { formatEur } from '../../../utils/format'
import { cuentaAtras, type OrigenView } from '../../../utils/perdidasPendientes'
import { DetalleCompensacion } from './DetalleCompensacion'

// Una pérdida por año de origen (#305, #541) como fila de la tabla alineada:
// año, estado, barra en la escala común de todos los años, pendiente (con la
// pérdida original debajo), ficha con la cuenta atrás y detalle desplegable.

const ESTADO: Record<OrigenView['estado'], { label: string; cls: string }> = {
  provisional: { label: 'provisional', cls: 'bg-overlay/8 text-fg-muted' },
  'caduca-este-anio': { label: 'caduca este año', cls: 'bg-warning/15 text-warning-ink' },
  vigente: { label: 'vigente', cls: 'bg-info/10 text-info-ink' },
  agotada: { label: 'compensada', cls: 'bg-positive/10 text-positive-ink' },
  caducada: { label: 'caducada', cls: 'bg-overlay/8 text-fg-subtle' },
}

/** Rayado: la pérdida del año en curso es provisional (#534). */
export const PROVISIONAL_CLS = 'bg-info/35 bg-[repeating-linear-gradient(45deg,transparent_0_3px,rgb(0_0_0/0.12)_3px_6px)]'
const CADUCADO_CLS = 'bg-fg-subtle/30 bg-[repeating-linear-gradient(45deg,transparent_0_3px,rgb(0_0_0/0.15)_3px_6px)]'
const CHIP = 'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap'

function Caduca({ o, hoy }: { o: OrigenView; hoy: string }) {
  if (o.estado === 'provisional') return <span className="text-[11px] text-fg-subtle">no suma al total</span>
  if (o.estado === 'agotada') return <span className="text-[11px] text-fg-subtle">compensada</span>
  if (o.estado === 'caducada') return <span className="text-[11px] text-fg-subtle">caducó en {o.caducaEn}</span>
  const ca = cuentaAtras(o.caducaEn, hoy)
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className={`${CHIP} ${ca.pronto ? 'bg-warning/15 text-warning-ink' : 'bg-overlay/8 text-fg-muted'}`}>
        {ca.pronto && <Hourglass size={11} aria-hidden="true" />}
        <span className="sr-only">Caduca en </span>{ca.corto}
      </span>
      <span className="text-[10.5px] text-fg-subtle mono">31 dic {o.caducaEn}</span>
    </span>
  )
}

export const FilaPerdida = forwardRef<HTMLTableRowElement, { o: OrigenView; ancho: number; hoy: string; resaltada: boolean }>(
  function FilaPerdida({ o, ancho, hoy, resaltada }, ref) {
    const uid = useId()
    const [abierto, setAbierto] = useState(false)
    const e = ESTADO[o.estado]
    const hayDetalle = (o.aplicaciones?.length ?? 0) > 0 || o.caducado > 0.005
    const fondo = resaltada ? 'bg-brand/10' : abierto ? 'bg-overlay/[0.03]' : ''
    return (
      <>
        <tr ref={ref} tabIndex={-1} className={`transition-colors scroll-mt-24 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand hover:bg-overlay/[0.04] ${fondo}`}>
          <th scope="row" className="py-3 pl-3 pr-2 text-left mono font-semibold text-fg">{o.year}</th>
          <td className="py-3 px-2"><span className={`${CHIP} ${e.cls}`}>{e.label}</span></td>
          <td className="py-3 px-3">
            {/* Escala común (#541): el ancho de la barra es la pérdida frente a la mayor de todas. */}
            <div className="h-2.5 rounded-full bg-background-tertiary">
              <div className="flex h-full rounded-full overflow-hidden" style={{ width: `${Math.max(ancho, o.original > 0 ? 1 : 0)}%` }} role="img"
                aria-label={`${o.year}: pérdida ${formatEur(o.original)}; compensado ${formatEur(o.compensado)}, ${o.estado === 'provisional' ? 'provisional' : 'pendiente'} ${formatEur(o.pendiente)}, caducado ${formatEur(o.caducado)}`}>
                <span className="h-full bg-positive/70" style={{ width: `${o.pct.compensado}%` }} />
                <span className={`h-full ${o.estado === 'caduca-este-anio' ? 'bg-warning' : o.estado === 'provisional' ? PROVISIONAL_CLS : 'bg-info/70'}`} style={{ width: `${o.pct.pendiente}%` }} />
                <span className={`h-full ${CADUCADO_CLS}`} style={{ width: `${o.pct.caducado}%` }} />
              </div>
            </div>
          </td>
          <td className="py-3 px-3 text-right whitespace-nowrap">
            <span className={`block mono tabular-nums text-sm font-semibold ${o.estado === 'provisional' ? 'text-fg-muted' : o.pendiente > 0.005 ? 'text-fg' : 'text-fg-subtle'}`}>{formatEur(o.pendiente)}</span>
            <span className="block text-[10.5px] text-fg-subtle">de <span className="mono">{formatEur(o.original)}</span></span>
          </td>
          <td className="py-3 px-3"><Caduca o={o} hoy={hoy} /></td>
          <td className="py-3 pl-1 pr-2 text-right">
            {hayDetalle && (
              <button type="button" onClick={() => setAbierto(v => !v)} aria-expanded={abierto} aria-controls={`${uid}-detalle`}
                aria-label={`${abierto ? 'Ocultar' : 'Ver'} el detalle de ${o.year}`}
                className="inline-flex size-7 items-center justify-center rounded-md text-fg-subtle hover:text-fg hover:bg-overlay/10 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
                <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${abierto ? 'rotate-180' : ''}`} />
              </button>
            )}
          </td>
        </tr>
        {abierto && (
          <tr className="bg-overlay/[0.03]">
            <td colSpan={6} className="px-3 pb-3 pt-0">
              {o.compensado > 0.005 && (
                <p className="text-[11px] text-fg-subtle">
                  Compensada: <span className="mono text-fg-muted">{formatEur(o.compensado)}</span>
                  {o.compensadoPatrim > 0.005 && <> · {formatEur(o.compensadoPatrim)} con ganancias</>}
                  {o.compensadoRend > 0.005 && <> · {formatEur(o.compensadoRend)} con rendimientos (hasta el 25 %)</>}
                </p>
              )}
              <DetalleCompensacion o={o} id={`${uid}-detalle`} />
            </td>
          </tr>
        )}
      </>
    )
  })
