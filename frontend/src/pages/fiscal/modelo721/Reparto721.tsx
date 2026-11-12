import { formatEur, formatNumber } from '../../../utils/format'
import { repartoEntidades } from '../../../utils/modelo721View'
import type { Grupo721 } from '../types'

// Reparto del valor que computa por entidad (#545): barra apilada y, debajo,
// la leyenda con nombre, importe y porcentaje en el mismo orden. El texto dice
// el reparto; el color solo empareja cada tramo con su fila.

const COLORES = ['var(--cf-brand-solid)', 'var(--cf-info)', 'var(--cf-accent-purple)', 'var(--cf-chart-warn)', 'var(--cf-chart-neutral)']

export function Reparto721({ grupos }: { grupos: readonly Grupo721[] }) {
  const reparto = repartoEntidades(grupos)
  if (reparto.length < 2) return null
  return (
    <figure className="space-y-2" aria-labelledby="m721-reparto">
      <figcaption id="m721-reparto" className="text-xs text-fg-subtle">Qué aporta cada entidad al valor que computa</figcaption>
      <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5" aria-hidden="true">
        {reparto.map((r, i) => (
          <span key={r.clave} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${Math.max(r.pct, 1)}%`, background: COLORES[i % COLORES.length] }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {reparto.map((r, i) => (
          <li key={r.clave} className="inline-flex items-center gap-1.5 min-w-0">
            <span aria-hidden="true" className="size-2 rounded-sm shrink-0" style={{ background: COLORES[i % COLORES.length] }} />
            <span className="text-fg-muted truncate max-w-[16rem]">{r.nombre}</span>
            <span className="mono text-fg tabular-nums">{formatEur(r.valorEur)}</span>
            <span className="text-fg-subtle tabular-nums">({formatNumber(r.pct, 0, 0)} %)</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}
