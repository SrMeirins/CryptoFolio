import type { CSSProperties } from 'react'
import type { TotalTramo } from '../../../utils/calendarioDietz'
import type { FilaAnio } from '../../../utils/rendimiento'
import type { Currency } from '../../../utils/format'
import { heatVars } from '../../../utils/topMovers'
import { signedMoney, signedPct } from '../calendar/format'

// Vista «Periodos» del panel Rendimiento (#517): tabla con una fila por año y
// columnas de meses, trimestres y año, coloreadas por su rentabilidad (Dietz
// modificado, como el calendario). Es tabla y mapa de calor a la vez; el
// importe va en el nombre accesible de cada celda.

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sept', 'Oct', 'Nov', 'Dic']
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function Celda({ t, cap, currency, titulo, fuerte = false }: { t: TotalTramo | null; cap: number; currency: Currency; titulo: string; fuerte?: boolean }) {
  if (!t || t.sinBase) {
    return (
      <td className="px-0.5 py-0.5">
        <span className="flex h-8 items-center justify-center rounded-md bg-overlay/3 text-[11px] text-fg-subtle">
          <span aria-hidden="true">{t ? '—' : ''}</span>
          <span className="sr-only">{titulo}: {t ? 'sin capital invertido' : 'sin datos'}</span>
        </span>
      </td>
    )
  }
  const ink = t.pct > 0 ? 'text-positive-ink' : t.pct < 0 ? 'text-negative-ink' : 'text-fg-muted'
  const texto = signedPct(t.pct).replace(/,(\d)\d/, ',$1')
  const lector = `${titulo}: ${signedPct(t.pct)}, ${signedMoney(t.pnl, currency)}${t.enCurso ? ', en curso' : ''}`
  // Poco representativo (#517): sin color de calor, borde discontinuo y cursiva; el texto conserva su contraste.
  if (!t.fiable) {
    return (
      <td className="px-0.5 py-0.5">
        <span data-poco-representativo="" className="flex h-8 items-center justify-center rounded-md border border-dashed border-border text-[11px] mono tabular-nums italic text-fg-muted">
          <span aria-hidden="true">{texto}</span>
          <span className="sr-only">{lector}, poco representativo por el poco capital invertido</span>
        </span>
      </td>
    )
  }
  return (
    <td className="px-0.5 py-0.5">
      <span style={heatVars(t.pct, cap) as CSSProperties}
        className={`tesela flex h-8 items-center justify-center rounded-md text-[11px] mono tabular-nums ${fuerte ? 'font-bold' : 'font-semibold'} ${ink}`}>
        <span aria-hidden="true">{texto}</span>
        <span className="sr-only">{lector}</span>
      </span>
    </td>
  )
}

export function RejillaPeriodos({ filas, currency }: { filas: FilaAnio[]; currency: Currency }) {
  // Escala del color: el mayor |%| mensual comparable (los trimestres y años usan la misma para compararlos).
  const cap = Math.max(1, ...filas.flatMap(f => f.meses.map(m => (m && m.fiable ? Math.abs(m.pct) : 0))))
  const hayPocoRepresentativos = filas.some(f => [...f.meses, ...f.trimestres, f.anio].some(t => t && !t.sinBase && !t.fiable))
  const cab = 'px-0.5 pb-1 text-[10px] font-medium uppercase tracking-wider text-fg-subtle text-center'
  return (
    // relative: los textos sr-only (absolutos) de las celdas quedan dentro del desplazamiento y no ensanchan la página.
    // Enfocable y con nombre: en estrecho la tabla se desplaza y debe poder recorrerse con el teclado.
    <div className="relative overflow-x-auto rounded-md focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand" data-testid="rejilla-periodos"
      tabIndex={0} role="region" aria-label="Tabla de rentabilidad por periodos">
      <table className="w-full min-w-[54rem] table-fixed border-separate border-spacing-0">
        <caption className="sr-only">Rentabilidad por mes, trimestre y año (Dietz modificado)</caption>
        <thead>
          <tr>
            <th scope="col" className={`${cab} w-12 text-left`}>Año</th>
            {MESES.map((m, i) => <th key={m} scope="col" abbr={MESES_LARGOS[i]} className={cab}>{m}</th>)}
            {[1, 2, 3, 4].map(q => <th key={q} scope="col" abbr={`trimestre ${q}`} className={`${cab} ${q === 1 ? 'border-l border-border pl-1.5' : ''}`}>T{q}</th>)}
            <th scope="col" className={`${cab} border-l border-border pl-1.5`}>Año</th>
          </tr>
        </thead>
        <tbody>
          {[...filas].reverse().map(f => (
            <tr key={f.year}>
              <th scope="row" className="pr-1 text-left text-xs mono font-semibold text-fg">{f.year}</th>
              {f.meses.map((m, i) => <Celda key={i} t={m} cap={cap} currency={currency} titulo={`${MESES_LARGOS[i]} de ${f.year}`} />)}
              {f.trimestres.map((t, q) => (
                <Celda key={`t${q}`} t={t} cap={cap} currency={currency} titulo={`trimestre ${q + 1} de ${f.year}`} />
              ))}
              <Celda t={f.anio} cap={cap} currency={currency} titulo={`año ${f.year}`} fuerte />
            </tr>
          ))}
        </tbody>
      </table>
      {hayPocoRepresentativos && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-fg-subtle">
          <span aria-hidden="true" className="inline-block h-3 w-5 rounded-sm border border-dashed border-border" />
          Borde discontinuo y cursiva: poco capital invertido en ese periodo, el % no es representativo y no cuenta para mejor y peor mes.
        </p>
      )}
    </div>
  )
}
