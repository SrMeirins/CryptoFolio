import { formatEur } from '../../../utils/format'
import { detalleCompensacion } from '../../../utils/perdidasPendientes'
import type { OrigenPerdida } from '../types'

// Detalle año a año de una pérdida (#541): en qué ejercicio se compensó, con
// ganancias o con rendimientos (hasta el 25 %), y lo que quedaba después.

export function DetalleCompensacion({ o, id }: { o: OrigenPerdida; id: string }) {
  const filas = detalleCompensacion(o)
  return (
    <div id={id} className="mt-2 rounded-lg border border-border overflow-hidden">
      <table className="w-full text-xs">
        <caption className="sr-only">Compensación año a año de la pérdida de {o.year}</caption>
        <thead>
          <tr className="bg-overlay/[0.04] text-[10.5px] uppercase tracking-wider text-fg-subtle">
            <th scope="col" className="px-3 py-1.5 text-left font-medium">Ejercicio</th>
            <th scope="col" className="px-3 py-1.5 text-right font-medium">Con ganancias</th>
            <th scope="col" className="px-3 py-1.5 text-right font-medium">Con rendimientos</th>
            <th scope="col" className="px-3 py-1.5 text-right font-medium">Queda</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {filas.map(f => (
            <tr key={f.year}>
              <th scope="row" className="px-3 py-1.5 text-left font-medium text-fg mono">{f.year}</th>
              <td className="px-3 py-1.5 text-right mono tabular-nums text-fg-muted">{formatEur(f.patrim)}</td>
              <td className="px-3 py-1.5 text-right mono tabular-nums text-fg-muted">{formatEur(f.rend)}</td>
              <td className="px-3 py-1.5 text-right mono tabular-nums text-fg">{formatEur(f.queda)}</td>
            </tr>
          ))}
          {o.caducado > 0.005 && (
            <tr>
              <th scope="row" className="px-3 py-1.5 text-left font-medium text-fg-muted">Caducó el 31 dic {o.caducaEn}</th>
              <td colSpan={2} />
              <td className="px-3 py-1.5 text-right mono tabular-nums text-fg-subtle">{formatEur(o.caducado)} sin usar</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
