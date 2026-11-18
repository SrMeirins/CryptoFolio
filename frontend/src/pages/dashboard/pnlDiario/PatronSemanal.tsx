import { InfoTooltip } from '../../../components/InfoTooltip'
import type { Currency } from '../../../utils/format'
import type { MediaDiaSemana } from '../../../utils/calendarioDia'
import { signedCompact, signedMoney } from '../calendar/format'

// Patrón por día de la semana del periodo (#512): media del P&L de los días
// cerrados de cada día, de lunes a domingo, en barras desde el 0. El título
// dice sobre qué periodo se calcula (el del selector de rango) y bajo cada
// barra va la media y cuántos días entran en ella; con menos de MIN_MUESTRA de
// algún día se avisa de que la media es poco representativa. La tabla oculta
// la lee completa el lector de pantalla.

const NOMBRES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const CORTOS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const PLURALES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos']
/** Por debajo de estos días de un mismo día de la semana, la media es poco representativa. */
const MIN_MUESTRA = 4

export function PatronSemanal({ patron, currency, periodo }: {
  patron: readonly MediaDiaSemana[]
  currency: Currency
  /** Periodo sobre el que se calcula, en minúsculas: «últimos 30 días», «toda la historia». */
  periodo: string
}) {
  const max = patron.reduce((m, p) => Math.max(m, Math.abs(p.media ?? 0)), 0)
  if (max === 0) return null
  return (
    <div data-testid="patron-semanal">
      <div className="flex items-center gap-1 mb-1.5">
        <p className="text-[10.5px] uppercase tracking-widest text-fg-subtle">Media por día de la semana, {periodo}</p>
        <InfoTooltip label="Qué muestra la media por día de la semana">
          <p>Para cada día de la semana, la media del P&L de los días cerrados de ese día dentro del periodo elegido arriba ({periodo}). Hoy no cuenta hasta que cierra.</p>
          <p className="mt-1.5 text-fg-subtle">Bajo cada barra, la media y cuántos días entran en ella. Con pocos días la media depende mucho de uno solo: elige un periodo más largo (por ejemplo, Todo) para ver un patrón fiable.</p>
        </InfoTooltip>
      </div>
      <div aria-hidden="true" className="grid grid-cols-7 gap-1.5">
        {patron.map(p => {
          const alto = p.media === null ? 0 : Math.max(4, (Math.abs(p.media) / max) * 100)
          const color = (p.media ?? 0) > 0 ? 'bg-positive' : (p.media ?? 0) < 0 ? 'bg-negative' : 'bg-fg-subtle/40'
          return (
            <div key={p.dia} className="flex flex-col items-center gap-1 min-w-0">
              {/* Mitad superior para las medias positivas y mitad inferior para las negativas, con el 0 en medio. */}
              <div className="relative w-full h-14">
                <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
                {p.media !== null && (
                  <span className={`absolute left-1/2 -translate-x-1/2 w-3/5 max-w-6 rounded-sm ${color} ${p.media >= 0 ? 'bottom-1/2 rounded-b-none' : 'top-1/2 rounded-t-none'}`}
                    style={{ height: `${alto / 2}%` }} />
                )}
              </div>
              <span className="text-[10px] font-semibold text-fg-muted">{CORTOS[p.dia]}</span>
              <span className={`text-[10px] mono tabular-nums truncate max-w-full ${(p.media ?? 0) > 0 ? 'text-positive-ink' : (p.media ?? 0) < 0 ? 'text-negative-ink' : 'text-fg-subtle'}`}>
                {p.media === null ? '—' : signedCompact(p.media, currency)}
              </span>
              <span className={`text-[10px] tabular-nums truncate max-w-full ${p.dias < MIN_MUESTRA ? 'text-warning-ink' : 'text-fg-subtle'}`}>
                {p.dias}<span className="hidden sm:inline"> {p.dias === 1 ? NOMBRES[p.dia] : PLURALES[p.dia]}</span>
              </span>
            </div>
          )
        })}
      </div>
      {patron.some(p => p.dias < MIN_MUESTRA) && (
        <p className="mt-1.5 text-[11px] text-warning-ink">Pocos días en el periodo: algunas medias se basan en menos de {MIN_MUESTRA} días. Amplía el periodo para ver un patrón fiable.</p>
      )}
      {/* La tabla no encoge al ancho de sr-only: la envuelve un contenedor que sí lo hace. */}
      <div className="sr-only">
      <table>
        <caption>Media del P&L por día de la semana, {periodo}</caption>
        <thead><tr><th scope="col">Día</th><th scope="col">Media</th><th scope="col">Días cerrados</th></tr></thead>
        <tbody>
          {patron.map(p => (
            <tr key={p.dia}><th scope="row">{NOMBRES[p.dia]}</th><td>{p.media === null ? 'sin días' : signedMoney(p.media, currency)}</td><td>{p.dias}</td></tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
