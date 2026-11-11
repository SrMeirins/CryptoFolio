import { formatEur } from '../../../utils/format'
import { formatFiscalQty } from '../../../utils/fiscalTable'
import { sinEfecto, type FilaTabla } from '../../../utils/operacionesTabla'
import { EventWarnings } from '../EventWarnings'
import { ClaveCell, FechaCell, ParCell, Resultado, TypeBadge } from '../FiscalEventRow'
import { RentaCell } from './FilaOperacion'
import { textoNota, textoValoracion } from './textoComision'

// Operación o grupo de microoperaciones como tarjeta, en pantallas estrechas (#299, #543).
export function TarjetaOperacion({ fila }: { fila: FilaTabla }) {
  if (fila.tipo === 'micro') {
    const g = fila.grupo
    return (
      <li className="px-4 py-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-xs text-fg-muted">
          <FechaCell e={g.operaciones[0]} />
          <span className="mono text-sm font-semibold"><Resultado gp={g.gananciaPerdidaEur} /></span>
        </div>
        <p className="text-sm text-fg">{g.operaciones.length} microoperaciones de {g.activo}</p>
        <p className="text-[11px] text-fg-subtle">Transmisión <span className="mono">{formatEur(g.valorTransmisionEur)}</span> · adquisición <span className="mono">{formatEur(g.valorAdquisicionEur)}</span></p>
      </li>
    )
  }
  const o = fila.op
  return (
    <li className="px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs text-fg-muted"><FechaCell e={o} /><TypeBadge tipo={o.tipo} recibido={o.activoRecibido} /></span>
        <span className="inline-flex items-center gap-1 mono text-sm font-semibold"><EventWarnings e={o} /><Resultado gp={o.gananciaPerdidaEur ?? 0} /></span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <ParCell e={o} />
        <span className="mono text-xs text-fg-subtle">{formatFiscalQty(o.cantidadTransmitida)}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <div><dt className="text-fg-subtle">Transmisión</dt><dd className="mono text-fg">{formatEur(o.valorTransmisionEur)}</dd></div>
        <div><dt className="text-fg-subtle">Adquisición</dt><dd className="mono text-fg">{formatEur(o.valorAdquisicionEur)}</dd></div>
        {o.gastosTransmisionEur > 0.005 && <div><dt className="text-fg-subtle">Gastos de transmisión</dt><dd className="mono text-fg">{formatEur(o.gastosTransmisionEur)}</dd></div>}
        {o.gastosAdquisicionEur > 0.005 && <div><dt className="text-fg-subtle">Gastos de adquisición</dt><dd className="mono text-fg">{formatEur(o.gastosAdquisicionEur)}</dd></div>}
        <div className="col-span-2 flex items-center gap-2 text-fg-subtle"><ClaveCell e={o} /> <RentaCell declara={!sinEfecto(o)} /> <span className="truncate">{o.wallet}{o.lotes.length > 1 ? ` · ${o.lotes.length} lotes` : ''}</span></div>
        {textoNota(o) && <p className="col-span-2 text-[11px] text-fg-muted">{textoNota(o)}</p>}
        {textoValoracion(o) && <p className="col-span-2 text-[11px] text-fg-muted">{textoValoracion(o)}</p>}
      </dl>
    </li>
  )
}
