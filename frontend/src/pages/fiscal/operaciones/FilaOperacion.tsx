import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { formatEur } from '../../../utils/format'
import { formatFiscalDate, formatFiscalQty } from '../../../utils/fiscalTable'
import { sinEfecto, type Operacion } from '../../../utils/operacionesTabla'
import { tableRowClasses } from '../../../components/ui'
import { EventWarnings } from '../EventWarnings'
import { ClaveCell, FechaCell, ParCell, Resultado, TypeBadge } from '../FiscalEventRow'
import { columnasExtra, PADDING, type ColumnaOpcional, type Densidad } from './preferencias'
import { ChipCanal, ChipComision, IconoNota } from './NotaComision'
import { textoNota, textoValoracion } from './textoComision'

// Una operación de la tabla (#543): una fila con sus totales y, desplegable,
// los lotes FIFO que consumió, con su fecha de compra, coste y resultado.

export function RentaCell({ declara }: { declara: boolean }) {
  return declara
    ? <span className="text-xs px-1.5 py-0.5 rounded-md bg-positive/10 text-positive-ink">Sí</span>
    : <span className="text-xs px-1.5 py-0.5 rounded-md bg-overlay/8 text-fg-muted">No</span>
}

/** Un importe de gastos: vacío si es cero, como pide la tabla (#543). */
export function GastoCell({ valor }: { valor: number }) {
  return valor < 0.005 ? null : <span className="block text-right mono text-fg-muted">{formatEur(valor)}</span>
}

export function FilaOperacion({ op, columnas, densidad }: {
  op: Operacion
  /** Columnas opcionales visibles, ya filtradas por si hay gastos de cada tipo. */
  columnas: ReadonlySet<ColumnaOpcional>
  densidad: Densidad
}) {
  const uid = useId()
  const [abierto, setAbierto] = useState(false)
  const p = PADDING[densidad]
  const ver = (c: ColumnaOpcional) => columnas.has(c)
  const nCols = 4 + columnasExtra(columnas)
  const gp = op.gananciaPerdidaEur ?? 0
  return (
    <>
      <tr className={tableRowClasses(false, abierto)}>
        <td className={`pl-4 pr-1.5 ${p} whitespace-nowrap text-fg-muted`}><FechaCell e={op} /></td>
        <td className={`px-2.5 ${p} min-w-[10rem]`}>
          {/* Cómoda: el tipo en la segunda línea, con la wallet y los lotes; compacta: delante del par. */}
          <span className="flex items-center gap-1.5 min-w-0">
            {ver('tipo') && densidad === 'compacta' && <TypeBadge tipo={op.tipo} recibido={op.activoRecibido} />}
            <ParCell e={op} />
            {densidad === 'compacta' && <IconoNota op={op} />}
          </span>
          {densidad === 'comoda' && (
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-1 text-[11px] text-fg-subtle">
              {ver('tipo') && <TypeBadge tipo={op.tipo} recibido={op.activoRecibido} />}
              <span className="whitespace-nowrap">{op.wallet}{op.lotes.length > 1 && ` · ${op.lotes.length} lotes`}</span>
              <ChipCanal op={op} />
              <ChipComision op={op} />
            </span>
          )}
        </td>
        {ver('cantidad') && <td className={`px-2.5 ${p} text-right mono text-fg-muted`}>{formatFiscalQty(op.cantidadTransmitida)}</td>}
        {ver('clave') && <td className={`px-2.5 ${p} text-center`}><ClaveCell e={op} /></td>}
        {ver('transmision') && <td className={`px-2.5 ${p} text-right mono whitespace-nowrap`}>{formatEur(op.valorTransmisionEur)}</td>}
        {ver('gastosTransmision') && <td className={`px-2.5 ${p}`}><GastoCell valor={op.gastosTransmisionEur} /></td>}

        {ver('adquisicion') && <td className={`px-2.5 ${p} text-right mono whitespace-nowrap`}>{formatEur(op.valorAdquisicionEur)}</td>}
        {ver('gastosAdquisicion') && <td className={`px-2.5 ${p}`}><GastoCell valor={op.gastosAdquisicionEur} /></td>}
        <td className={`px-2.5 ${p} text-right mono font-semibold whitespace-nowrap`}>
          <span className="inline-flex items-center justify-end gap-1"><EventWarnings e={op} /><Resultado gp={gp} /></span>
        </td>
        {ver('renta') && <td className={`px-1.5 ${p} text-center`}><RentaCell declara={!sinEfecto(op)} /></td>}
        <td className={`pl-0.5 pr-2 ${p} text-right`}>
          <button type="button" onClick={() => setAbierto(v => !v)} aria-expanded={abierto} aria-controls={`${uid}-lotes`}
            aria-label={`${abierto ? 'Ocultar' : 'Ver'} los lotes de ${op.activoTransmitido} del ${formatFiscalDate(op.fecha)}`}
            className="inline-flex size-7 items-center justify-center rounded-md text-fg-subtle hover:text-fg hover:bg-overlay/10 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
            <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${abierto ? 'rotate-180' : ''}`} />
          </button>
        </td>
      </tr>
      {abierto && (
        <tr className="bg-background-tertiary/40">
          <td colSpan={nCols} className="px-4 pb-3 pt-1">
            <table id={`${uid}-lotes`} className="w-full text-xs rounded-lg overflow-hidden border border-border">
              <caption className="sr-only">Lotes FIFO consumidos por la operación de {op.activoTransmitido} del {formatFiscalDate(op.fecha)}</caption>
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wider text-fg-subtle bg-overlay/[0.04]">
                  <th scope="col" className="px-3 py-1.5 text-left font-medium">Lote comprado el</th>
                  <th scope="col" className="px-3 py-1.5 text-right font-medium">Cantidad</th>
                  <th scope="col" className="px-3 py-1.5 text-right font-medium">Transmisión</th>
                  <th scope="col" className="px-3 py-1.5 text-right font-medium">Gastos de transmisión</th>
                  <th scope="col" className="px-3 py-1.5 text-right font-medium">Adquisición</th>
                  <th scope="col" className="px-3 py-1.5 text-right font-medium">Gastos de adquisición</th>
                  <th scope="col" className="px-3 py-1.5 text-right font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {op.lotes.map(l => (
                  <tr key={l.eventId}>
                    <th scope="row" className="px-3 py-1.5 text-left font-normal text-fg-muted">{l.fechaAdquisicion ? formatFiscalDate(l.fechaAdquisicion) : 'Sin fecha'}</th>
                    <td className="px-3 py-1.5 text-right mono text-fg-muted">{formatFiscalQty(l.cantidadTransmitida)}</td>
                    <td className="px-3 py-1.5 text-right mono">{formatEur(l.valorTransmisionEur)}</td>
                    <td className="px-3 py-1.5 text-right mono text-fg-muted">{l.gastosTransmisionEur > 0.005 ? formatEur(l.gastosTransmisionEur) : ''}</td>
                    <td className="px-3 py-1.5 text-right mono">{formatEur(l.valorAdquisicionEur)}</td>
                    <td className="px-3 py-1.5 text-right mono text-fg-muted">{l.gastosAdquisicionEur > 0.005 ? formatEur(l.gastosAdquisicionEur) : ''}</td>
                    <td className="px-3 py-1.5 text-right mono font-medium"><Resultado gp={l.gananciaPerdidaEur ?? 0} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1.5 text-[11px] text-fg-subtle">{op.wallet} · clave {op.contrapartidaClave || 'por revisar'}: {op.contrapartidaDescripcion}</p>
            {textoNota(op) && <p className="mt-1 text-[11px] text-fg-muted">{textoNota(op)}</p>}
            {textoValoracion(op) && <p className="mt-1 text-[11px] text-fg-muted">{textoValoracion(op)}</p>}
          </td>
        </tr>
      )}
    </>
  )
}
