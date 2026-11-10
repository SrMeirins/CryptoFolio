import { CryptoIcon } from '../../../../components/CryptoIcon'
import { formatMoneyCompact, pnlColor, formatEurSigned } from '../../../../utils/format'
import { cascadaContribucion, escalaCascada, tramoBarra, type PasoContribucion } from '../../../../utils/desgloseActivo'
import type { BreakdownItem } from '../../types'

// Contribución por activo (#540): cascada horizontal clásica de cómo cada
// activo suma o resta hasta el neto del ejercicio, primero lo que suma y
// después lo que resta. Escala con marcas redondas arriba y rejilla tenue;
// una línea punteada une el final de cada barra con el inicio de la
// siguiente. La última fila, en su banda, es el neto: la suma de todos.

const signed = formatEurSigned

// Barra con degradado hacia su extremo y borde del mismo tono; el color va
// siempre con el signo del importe en texto.
function estiloBarra(p: PasoContribucion): string {
  if (p.total) return 'bg-gradient-to-r from-brand/55 to-brand/90 ring-1 ring-inset ring-brand/50'
  return p.importe >= 0
    ? 'bg-gradient-to-r from-positive/45 to-positive/85 ring-1 ring-inset ring-positive/45'
    : 'bg-gradient-to-l from-negative/45 to-negative/85 ring-1 ring-inset ring-negative/45'
}

/** Rejilla de la escala dentro de una fila: marcas tenues y el cero más marcado. */
function Rejilla({ ticks, pos }: { ticks: readonly number[]; pos: (v: number) => number }) {
  return (
    <>
      {ticks.map(t => (
        <span key={t} className={`absolute inset-y-0 w-px ${t === 0 ? 'bg-fg-subtle/55' : 'bg-overlay/[0.07]'}`} style={{ left: `${pos(t)}%` }} />
      ))}
    </>
  )
}

export function ContribucionActivos({ data, onSelectAsset }: { data: readonly BreakdownItem[]; onSelectAsset: (asset: string) => void }) {
  const { pasos, min, max } = cascadaContribucion(data)
  const esc = escalaCascada(min, max)
  const pos = (v: number) => tramoBarra({ desde: v, hasta: v }, esc.min, esc.max).left
  return (
    <table className="w-full text-sm border-collapse">
      <caption className="sr-only">Contribución de cada activo al neto del ejercicio</caption>
      <thead aria-hidden="true">
        <tr>
          <th className="w-48" />
          {/* Etiquetas de la escala, alineadas con la rejilla de las filas */}
          <th className="px-3 pb-2">
            <div className="relative h-4">
              {esc.ticks.map(t => (
                <span key={t} className="absolute top-0 -translate-x-1/2 text-[10px] font-normal mono tabular-nums text-fg-subtle whitespace-nowrap"
                  style={{ left: `${pos(t)}%` }}>{formatMoneyCompact(t, 'EUR')}</span>
              ))}
            </div>
          </th>
          <th className="w-28" />
        </tr>
      </thead>
      <tbody>
        {pasos.map((p, i) => {
          const barra = tramoBarra(p, esc.min, esc.max)
          const pulsable = !p.total && !p.agrupados
          const nombre = p.agrupados ? `Otros (${p.agrupados} activos)` : p.label
          const banda = p.total ? 'bg-overlay/[0.05] border-t border-border' : ''
          return (
            <tr key={p.clave} className="group/fila">
              <th scope="row" className={`h-9 pl-2 pr-3 text-left w-48 whitespace-nowrap ${banda} ${p.total ? 'rounded-bl-lg font-semibold text-fg' : 'font-normal'}`}>
                {pulsable ? (
                  <button type="button" onClick={() => onSelectAsset(p.label)} aria-label={`${p.label}: ${signed(p.importe)}. Ver sus operaciones`}
                    className="inline-flex items-center gap-2 rounded-md group-hover/fila:underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
                    <CryptoIcon symbol={p.label} size={16} />
                    <span className="mono font-bold text-fg">{p.label}</span>
                  </button>
                ) : (
                  <span className={`inline-flex items-center gap-2 ${p.total ? '' : 'text-fg-muted'}`}>
                    {!p.total && <span className="size-4 rounded-full bg-overlay/15 ring-1 ring-inset ring-overlay/20" aria-hidden="true" />}
                    {nombre}
                  </span>
                )}
              </th>
              <td className={`h-9 px-3 ${banda}`}>
                <div className="relative h-9" aria-hidden="true">
                  <Rejilla ticks={esc.ticks} pos={pos} />
                  {/* Conector: del final de la barra anterior al inicio de esta */}
                  {i > 0 && (
                    <span className="absolute -top-px h-[9px] border-l border-dashed border-fg-subtle/70"
                      style={{ left: `${pos(pasos[i - 1].hasta)}%` }} />
                  )}
                  <div className={`absolute top-2 h-5 rounded-md shadow-sm transition-[filter] group-hover/fila:brightness-110 ${estiloBarra(p)}`}
                    style={{ left: `${barra.left}%`, width: `max(${barra.width}%, ${Math.abs(p.importe) > 0.005 ? 3 : 0}px)` }} />
                  {/* El conector sigue hasta la fila siguiente desde el final de esta barra */}
                  {i < pasos.length - 1 && (
                    <span className="absolute bottom-0 h-[9px] border-l border-dashed border-fg-subtle/70"
                      style={{ left: `${pos(p.hasta)}%` }} />
                  )}
                </div>
              </td>
              <td className={`h-9 pl-2 pr-3 text-right mono tabular-nums whitespace-nowrap w-28 ${banda} ${p.total ? 'rounded-br-lg font-bold' : 'font-medium'} ${pnlColor(p.importe)}`}>
                {signed(p.importe)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
