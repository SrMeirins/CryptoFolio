import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { CryptoIcon } from '../../../components/CryptoIcon'
import { formatEur } from '../../../utils/format'
import { formatFiscalDate } from '../../../utils/fiscalTable'
import { parTexto, type GrupoMicro } from '../../../utils/operacionesTabla'
import { tableRowClasses } from '../../../components/ui'
import { FechaCell, Resultado, TypeBadge } from '../FiscalEventRow'
import { GastoCell, RentaCell } from './FilaOperacion'
import { columnasExtra, PADDING, type ColumnaOpcional, type Densidad } from './preferencias'

// Microoperaciones agrupadas (#543): las de menos de 1 € del mismo día y
// activo en una fila con sus totales y, desplegadas, una a una.

export function FilaMicro({ grupo, columnas, densidad }: {
  grupo: GrupoMicro
  /** Columnas opcionales visibles, ya filtradas por si hay gastos de cada tipo. */
  columnas: ReadonlySet<ColumnaOpcional>
  densidad: Densidad
}) {
  const uid = useId()
  const [abierto, setAbierto] = useState(false)
  const p = PADDING[densidad]
  const ver = (c: ColumnaOpcional) => columnas.has(c)
  const nCols = 4 + columnasExtra(columnas)
  const n = grupo.operaciones.length
  return (
    <>
      <tr className={tableRowClasses(false, abierto)}>
        <td className={`pl-4 pr-1.5 ${p} whitespace-nowrap text-fg-muted`}><FechaCell e={grupo.operaciones[0]} /></td>
        <td className={`px-2.5 ${p}`}>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <CryptoIcon symbol={grupo.activo} size={16} />
            <span className="font-medium text-fg">{n} microoperaciones de {grupo.activo}</span>
          </span>
          {densidad === 'comoda' && (
            <span className="flex items-center gap-1.5 mt-1 text-[11px] text-fg-subtle whitespace-nowrap">
              {ver('tipo') && <span className="text-[11px] px-1.5 py-0.5 rounded-lg bg-overlay/8 text-fg-muted">Agrupadas</span>}
              <span>menos de 1 € cada una</span>
            </span>
          )}
        </td>
        {ver('cantidad') && <td className={`px-2.5 ${p}`} />}
        {ver('clave') && <td className={`px-2.5 ${p}`} />}
        {ver('transmision') && <td className={`px-2.5 ${p} text-right mono whitespace-nowrap`}>{formatEur(grupo.valorTransmisionEur)}</td>}
        {ver('gastosTransmision') && <td className={`px-2.5 ${p}`}><GastoCell valor={grupo.gastosTransmisionEur} /></td>}

        {ver('adquisicion') && <td className={`px-2.5 ${p} text-right mono whitespace-nowrap`}>{formatEur(grupo.valorAdquisicionEur)}</td>}
        {ver('gastosAdquisicion') && <td className={`px-2.5 ${p}`}><GastoCell valor={grupo.gastosAdquisicionEur} /></td>}
        <td className={`px-2.5 ${p} text-right mono font-semibold whitespace-nowrap`}><Resultado gp={grupo.gananciaPerdidaEur} /></td>
        {ver('renta') && <td className={`px-1.5 ${p} text-center`}><RentaCell declara /></td>}
        <td className={`pl-0.5 pr-2 ${p} text-right`}>
          <button type="button" onClick={() => setAbierto(v => !v)} aria-expanded={abierto} aria-controls={`${uid}-ops`}
            aria-label={`${abierto ? 'Ocultar' : 'Ver'} las ${n} microoperaciones de ${grupo.activo} del ${formatFiscalDate(grupo.fecha)}`}
            className="inline-flex size-7 items-center justify-center rounded-md text-fg-subtle hover:text-fg hover:bg-overlay/10 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
            <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${abierto ? 'rotate-180' : ''}`} />
          </button>
        </td>
      </tr>
      {abierto && (
        <tr className="bg-background-tertiary/40">
          <td colSpan={nCols} className="px-4 pb-3 pt-1">
            <ul id={`${uid}-ops`} className="divide-y divide-border/60 rounded-lg border border-border text-xs">
              {grupo.operaciones.map(o => (
                <li key={o.txId} className="flex items-center gap-3 px-3 py-1.5">
                  <TypeBadge tipo={o.tipo} recibido={o.activoRecibido} />
                  <span className="flex-1 text-fg-muted">{parTexto(o)}</span>
                  <span className="mono text-fg-muted">{formatEur(o.valorTransmisionEur)}</span>
                  <span className="mono font-medium w-20 text-right"><Resultado gp={o.gananciaPerdidaEur ?? 0} /></span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  )
}
