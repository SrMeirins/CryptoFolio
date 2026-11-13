import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Hourglass, PiggyBank } from 'lucide-react'
import { portfolioApi, type FiscalPlanner } from '../../../api/portfolio'
import { cardClasses, fieldClasses, Notice, QueryError } from '../../../components/ui'
import { useDebounce } from '../../../hooks/useDebounce'
import { parseImporte } from '../../../utils/declaraciones'
import { formatEur, formatEurSigned } from '../../../utils/format'
import { cascadaColchon, composicionColchon, parseImporteConSigno, type ClavePaso, type PasoColchon } from '../../../utils/planVentas'

// Colchón sin tributar (#546): la cifra y cómo se llega a ella en una
// cascada de columnas (cada origen suma, lo ya usado resta y la última columna
// es el colchón), con colores bien distintos y el importe y el nombre de cada
// paso siempre en texto. «Prueba una cifra» dice si una ganancia cabe en el
// colchón y, si no, cuánto pagarías de más; en el gráfico se marca sobre el
// colchón.

const COLOR: Record<ClavePaso, string> = {
  perdidaAnio: 'var(--cf-info)',
  pendientes: 'var(--cf-accent-purple)',
  caducan: 'var(--cf-chart-warn)',
  usado: 'var(--cf-chart-neutral)',
  colchon: 'var(--cf-positive)',
}

const ALTO = 'h-44'

/** Barra de un paso, en su columna; todas las columnas comparten la línea de base. */
function Barra({ p, max, siguiente, prueba }: { p: PasoColchon; max: number; siguiente: boolean; prueba: number | null }) {
  const pct = (v: number) => (max > 0 ? (v / max) * 100 : 0)
  const abajo = Math.min(p.desde, p.hasta)
  const alto = Math.abs(p.importe)
  const conPrueba = prueba !== null && prueba > 0
  const exceso = conPrueba && prueba > p.hasta ? prueba - p.hasta : 0
  const importe = p.tipo === 'resta' ? formatEurSigned(p.importe) : formatEur(p.importe)
  return (
    <div className={`relative flex-1 min-w-0 ${ALTO}`}>
      {/* Encima: el importe del paso o, si se prueba una cifra sobre el colchón, esa cifra */}
      <span className={`absolute inset-x-0 text-center text-[11px] mono tabular-nums whitespace-nowrap ${p.tipo === 'total' ? 'font-semibold text-fg' : 'text-fg-muted'}`}
        style={{ bottom: `calc(${pct(conPrueba ? Math.max(p.hasta, prueba) : Math.max(p.desde, p.hasta))}% + 4px)` }}>
        {conPrueba ? `Tu cifra ${formatEur(prueba)}` : importe}
      </span>
      <span className="absolute left-1/2 -translate-x-1/2 w-3/5 max-w-16 rounded-md ring-1 ring-inset ring-black/10 flex items-start justify-center overflow-hidden"
        style={{ bottom: `${pct(abajo)}%`, height: `max(${pct(alto)}%, ${alto > 0.005 ? 3 : 0}px)`, background: COLOR[p.clave] }}>
        {/* Con una cifra probada, el importe del colchón va dentro de su barra */}
        {conPrueba && <span className="mt-1 text-[10.5px] font-semibold mono tabular-nums text-background-card whitespace-nowrap">{importe}</span>}
      </span>
      {conPrueba && (
        <>
          <span className="absolute left-1/2 -translate-x-1/2 w-3/4 max-w-20 border-t-2 border-dashed border-fg" style={{ bottom: `${pct(prueba)}%` }} />
          {exceso > 0 && (
            <span className="absolute left-1/2 -translate-x-1/2 w-3/5 max-w-16 rounded-t-md bg-[repeating-linear-gradient(45deg,var(--cf-negative)_0_4px,transparent_4px_8px)] ring-1 ring-inset ring-negative"
              style={{ bottom: `${pct(p.hasta)}%`, height: `${pct(exceso)}%` }} />
          )}
        </>
      )}
      {/* Conector discontinuo al nivel donde empieza la columna siguiente */}
      {siguiente && <span className="absolute left-[80%] -right-[20%] border-t border-dashed border-fg-subtle/70" style={{ bottom: `${pct(p.hasta)}%` }} />}
    </div>
  )
}

function PruebaCifra({ colchon, cuotaActual, onCambio }: { colchon: number; cuotaActual: number; onCambio: (v: number | null) => void }) {
  const uid = useId()
  const [txt, setTxt] = useState('')
  const valor = txt.trim() ? parseImporteConSigno(txt, parseImporte) : Number.NaN
  const extra = useDebounce(valor, 350)
  const valido = Number.isFinite(extra) && Math.abs(extra) <= 1e9
  const cuotaQ = useQuery({
    queryKey: ['fiscal-cuotas', 'rapida', extra],
    queryFn: () => portfolioApi.getFiscalCuotas([extra]),
    enabled: valido,
    staleTime: 60_000,
  })
  const cuota = cuotaQ.data?.cuotas[0]
  function cambiar(t: string) {
    setTxt(t)
    const v = t.trim() ? parseImporteConSigno(t, parseImporte) : Number.NaN
    onCambio(Number.isFinite(v) ? v : null)
  }
  let resultado = ''
  if (valido && cuota !== undefined) {
    const mas = cuota - cuotaActual
    if (extra <= 0) resultado = `Con una pérdida de ${formatEur(-extra)}, tu cuota quedaría en ${formatEur(cuota)}.`
    else if (extra <= colchon + 0.005) resultado = `Cabe en el colchón: no pagarías nada más (cuota de ${formatEur(cuota)}).`
    else resultado = `Pasa del colchón en ${formatEur(extra - colchon)}: pagarías ${formatEur(mas)} más (cuota de ${formatEur(cuotaActual)} a ${formatEur(cuota)}).`
  }
  return (
    <div className="rounded-xl border border-border px-3 py-2.5 space-y-1.5">
      <label className="flex items-center gap-2 flex-wrap text-sm">
        <span className="font-medium text-fg">Prueba una cifra:</span>
        <span className="text-fg-muted">si realizo</span>
        <input type="text" inputMode="decimal" value={txt} onChange={e => cambiar(e.target.value)} placeholder="2.000" maxLength={14}
          aria-describedby={`${uid}-ayuda`} className={fieldClasses('sm', txt !== '' && !Number.isFinite(valor), 'w-32 mono text-right')} />
        <span className="text-fg-muted">€ de ganancia</span>
      </label>
      {cuotaQ.isError && <QueryError what="la estimación" error={cuotaQ.error} onRetry={() => void cuotaQ.refetch()} />}
      <p aria-live="polite" className={`text-sm ${valido && extra > colchon + 0.005 ? 'text-negative-ink' : 'text-fg'}`}>{resultado}</p>
      <p id={`${uid}-ayuda`} className="text-[11px] text-fg-subtle">Con un signo menos, una pérdida. Se marca en el gráfico sobre el colchón. Cuota del ahorro con tus tramos de Ajustes.</p>
    </div>
  )
}

export function ColchonBarra({ data }: { data: FiscalPlanner }) {
  const uid = useId()
  const c = composicionColchon(data)
  const pasos = cascadaColchon(c)
  const [prueba, setPrueba] = useState<number | null>(null)
  const max = Math.max(...pasos.map(p => Math.max(p.desde, p.hasta)), prueba !== null && prueba > 0 ? prueba : 0, 1)
  return (
    <section aria-labelledby="plan-colchon" className={cardClasses('md', 'bg-linear-to-br from-positive/8 to-transparent space-y-4')}>
      <div>
        <h2 id="plan-colchon" className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">
          <PiggyBank size={13} aria-hidden="true" /> Ganancia sin tributar en {data.year}
        </h2>
        <p className="text-3xl font-bold mono tabular-nums text-positive mt-2">{formatEur(c.colchon)}</p>
        <p className="text-xs text-fg-subtle mt-1 max-w-xl">
          Puedes realizar hasta esta ganancia antes del 31 de diciembre sin que suba tu cuota: la absorben las pérdidas del año y las pendientes de años anteriores.
        </p>
      </div>

      <figure aria-labelledby={`${uid}-t`} className="space-y-2">
        <figcaption id={`${uid}-t`} className="text-xs font-medium text-fg-muted">
          Cómo se llega al colchón: cada pérdida suma, lo ya usado resta
        </figcaption>
        <div aria-hidden="true">
          {/* Barras sobre una misma línea de base; los nombres, en una fila aparte para no desalinearlas */}
          <div className="flex gap-3 pt-5 border-b border-fg-subtle/40">
            {pasos.map((p, i) => <Barra key={p.clave} p={p} max={max} siguiente={i < pasos.length - 1} prueba={p.tipo === 'total' ? prueba : null} />)}
          </div>
          <div className="flex gap-3 pt-1.5">
            {pasos.map(p => (
              <span key={p.clave} className="flex-1 min-w-0 flex justify-center gap-1 text-[11px] leading-tight text-center text-fg-muted">
                <span className="mt-0.5 size-2 shrink-0 rounded-sm" style={{ background: COLOR[p.clave] }} />
                <span>{p.titulo}</span>
              </span>
            ))}
          </div>
        </div>
        <table className="sr-only">
          <caption>Cómo se llega al colchón</caption>
          <thead><tr><th scope="col">Paso</th><th scope="col">Importe</th></tr></thead>
          <tbody>
            {pasos.map(p => <tr key={p.clave}><th scope="row">{p.titulo}</th><td>{p.tipo === 'resta' ? formatEurSigned(p.importe) : formatEur(p.importe)}</td></tr>)}
          </tbody>
        </table>
        <p className="text-[11px] text-fg-subtle">
          «Ya usado»: lo que absorbieron las ganancias del año o no se puede aprovechar por los límites de compensación.
          {' '}Neto del año <span className="mono text-fg-muted">{formatEurSigned(data.netoAnio)}</span>,
          cuota actual <span className="mono text-fg-muted">{formatEur(data.cuotaActual)}</span>,
          rendimientos <span className="mono text-fg-muted">{formatEur(data.rendimientosAnio)}</span>.
        </p>
      </figure>

      <PruebaCifra colchon={c.colchon} cuotaActual={data.cuotaActual} onCambio={setPrueba} />

      {data.caducanEsteAnio > 0.01 && (
        <Notice tipo="aviso" icon={Hourglass} compact>
          <span className="mono font-semibold text-warning-ink">{formatEur(data.caducanEsteAnio)}</span> de pérdidas pendientes caducan el 31 de diciembre: si no las usas este año, se pierden.
        </Notice>
      )}
    </section>
  )
}
