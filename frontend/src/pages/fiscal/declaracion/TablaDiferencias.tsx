import { formatEur, formatEurSigned, formatNumber } from '../../../utils/format'
import { tablaDiferencias } from '../../../utils/pasosDeclaracion'
import type { Declaracion } from '../../../api/portfolio'

// Declarado frente a actual (#542): todos los conceptos de la marca, con los
// que han cambiado destacados y su diferencia.

const fmt = (campo: string, v: number) => (campo === 'operaciones' ? formatNumber(v, 0) : formatEur(v))
const fmtDif = (campo: string, v: number) => (campo === 'operaciones' ? `${v > 0 ? '+' : ''}${formatNumber(v, 0)}` : formatEurSigned(v))

export function TablaDiferencias({ marca, titulo }: { marca: Declaracion; titulo: string }) {
  const filas = tablaDiferencias(marca)
  return (
    <div className="rounded-xl border border-warning/30 overflow-hidden">
      <table className="w-full text-sm">
        <caption className="px-4 py-2.5 text-left text-xs font-semibold text-warning-ink bg-warning/8">{titulo}</caption>
        <thead>
          <tr className="text-[10.5px] uppercase tracking-wider text-fg-subtle border-b border-border">
            <th scope="col" className="px-4 py-2 text-left font-medium">Concepto</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Declarado</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Actual</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Diferencia</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {filas.map(f => (
            <tr key={f.campo} className={f.cambia ? 'bg-warning/[0.04]' : undefined}>
              <th scope="row" className={`px-4 py-2 text-left ${f.cambia ? 'font-semibold text-fg' : 'font-normal text-fg-muted'}`}>
                {f.concepto}{f.cambia && <span className="sr-only"> (ha cambiado)</span>}
              </th>
              <td className="px-4 py-2 text-right mono tabular-nums text-fg-muted">{fmt(f.campo, f.declarado)}</td>
              <td className={`px-4 py-2 text-right mono tabular-nums ${f.cambia ? 'font-semibold text-fg' : 'text-fg-muted'}`}>{fmt(f.campo, f.actual)}</td>
              <td className={`px-4 py-2 text-right mono tabular-nums ${f.cambia ? 'font-semibold text-warning-ink' : 'text-fg-subtle'}`}>{f.cambia ? fmtDif(f.campo, f.diferencia) : 'sin cambios'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
